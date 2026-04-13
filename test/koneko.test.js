import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { Koneko } from '../src/koneko.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsRoot = join(__dirname, 'assets');

const koneko = new Koneko({
    isolateCount: 1,
    memoryLimit: 128,
    cpuTimeout: 50,
});

await new Promise(resolve => setTimeout(resolve, 500));

describe('Koneko', () => {
    test('renders code with expected HTML', async () => {
        const { body, response } = await koneko.renderCode('<h1>Hello, World!</h1>', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.match(body, /<h1>Hello, World!<\/h1>/);
    });
    test('renders index.cat with expected HTML', async () => {
        const { body, response } = await koneko.renderFile('index.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.match(body, /<h1>Hello, World!<\/h1>/);
        assert.match(body, /<p>Test #0<\/p>/);
        assert.match(body, /<p>Test #9<\/p>/);
        assert.doesNotMatch(body, /Test #10/);
    });
    test('includes the file path in the template function', async () => {
        const { body, response } = await koneko.renderCode('<%- filePath %>', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.match(body, /__template/);
    });

    test('includes nested templates with shared response and locals', async () => {
        const { body, response } = await koneko.renderFile('include.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.equal(response.headers['x-partial'], 'shared');
        assert.match(body, /<ul>/);
        assert.match(body, /<li data-file="\/_partials\/item\.cat">first<\/li>/);
        assert.match(body, /<li data-file="\/_partials\/item\.cat">second<\/li>/);
    });

    test('console enables browser console replay for console methods', async () => {
        const { body, response } = await koneko.renderCode(`
            <html><body>
            <%
                console.log("hello", { answer: 42 });
                console.warn("careful");
                console.error("</script><b>bad</b>");
            %>
            <h1>Debug</h1>
            </body></html>
        `, {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.equal(response.status, 200);
        assert.match(body, /<h1>Debug<\/h1>/);
        assert.match(body, /console\[entry\.level\]/);
        assert.match(body, /"hello"/);
        assert.match(body, /"answer":42/);
        assert.match(body, /"warn"/);
        assert.match(body, /"error"/);
        assert.match(body, /"careful"/);
        assert.doesNotMatch(body, /<\/script><b>bad<\/b>/);
        assert.match(body, /<\/script><\/body><\/html>\s*$/);
    });

    test('console does not inject into non-html responses', async () => {
        const { body, response } = await koneko.renderCode(`
            <% response.headers.set("content-type", "application/json"); console.log("hidden"); %>
            {"ok":true}
        `, {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.equal(response.status, 200);
        assert.equal(response.headers['content-type'], 'application/json');
        assert.doesNotMatch(body, /console\.log\(/);
        assert.match(body, /\{"ok":true\}/);
    });

    test('does not inject browser console replay when there are no logs', async () => {
        const { body, response } = await koneko.renderCode(`
            <html><body>
            <h1>No Debug</h1>
            </body></html>
        `, {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.equal(response.status, 200);
        assert.doesNotMatch(body, /console\.log\(/);
    });

    test('exposes atob and btoa globals', async () => {
        const { body, response } = await koneko.renderCode(`
            <%- JSON.stringify({
                encoded: btoa("hello"),
                decoded: atob("aGVsbG8="),
                roundTrip: atob(btoa("koneko"))
            }) %>
        `, {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.equal(response.status, 200);
        assert.deepEqual(JSON.parse(body), {
            encoded: 'aGVsbG8=',
            decoded: 'hello',
            roundTrip: 'koneko',
        });
    });

    test('supports setTimeout in the sandbox', async () => {
        const { body, response } = await koneko.renderCode(`
            <%
                let done = false;
                await new Promise((resolve) => setTimeout(() => {
                    done = true;
                    resolve();
                }, 5));
            %>
            <%= done %>
        `, {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.equal(response.status, 200);
        assert.equal(body.trim(), 'true');
    });

    test('concurrent renderFile for the same file completes for all requests', async () => {
        const concurrent = new Koneko({
            isolateCount: 4,
            memoryLimit: 32,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

        const n = 12;
        const results = await Promise.all(
            Array.from({ length: n }, () =>
                concurrent.renderFile('index.cat', {
                    siteId: 'test-site',
                    siteRoot: assetsRoot,
                    request: {},
                }),
            ),
        );

        assert.equal(results.length, n);
        for (const { body } of results) {
            assert.match(body, /<h1>Hello, World!<\/h1>/);
        }
    });

    test('recompiles edited templates and includes on subsequent renders', async () => {
        const siteRoot = fs.mkdtempSync(join(tmpdir(), 'koneko-template-reload-'));
        fs.mkdirSync(join(siteRoot, '_partials'), { recursive: true });
        fs.writeFileSync(join(siteRoot, 'page.cat'), '<%= "before page" %>\n<% await include("./_partials/value.cat"); %>\n', 'utf8');
        fs.writeFileSync(join(siteRoot, '_partials', 'value.cat'), '<%= "before partial" %>\n', 'utf8');

        try {
            const siteId = 'test-template-reload';

            const first = await koneko.renderFile('page.cat', {
                siteId,
                siteRoot,
                request: {},
            });
            assert.match(first.body, /before page/);
            assert.match(first.body, /before partial/);

            fs.writeFileSync(join(siteRoot, 'page.cat'), '<%= "after page updated" %>\n<% await include("./_partials/value.cat"); %>\n', 'utf8');
            fs.writeFileSync(join(siteRoot, '_partials', 'value.cat'), '<%= "after partial updated more" %>\n', 'utf8');
            await new Promise((resolve) => setTimeout(resolve, 600));

            const second = await koneko.renderFile('page.cat', {
                siteId,
                siteRoot,
                request: {},
            });
            assert.match(second.body, /after page updated/);
            assert.match(second.body, /after partial updated more/);
            assert.doesNotMatch(second.body, /before page/);
            assert.doesNotMatch(second.body, /before partial/);
        } finally {
            fs.rmSync(siteRoot, { recursive: true, force: true });
        }
    });

    test('terminates while(true) loop', async () => {
        await assert.rejects(async () => {
            await koneko.renderFile('while-true.cat', {
                siteId: 'test-site',
                siteRoot: assetsRoot,
                request: {},
            });
        }, {
            message: /CPU limit exceeded/,
        });
    });

    test('terminates memory limit', async () => {
        await assert.rejects(async () => {
            await koneko.renderFile('memory-limit.cat', {
                siteId: 'test-site',
                siteRoot: assetsRoot,
                request: {},
            });
        }, {
            message: /(Array buffer allocation failed|CPU limit exceeded)/,
        });
    });
});
