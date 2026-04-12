import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { Koneko } from '../src/koneko.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsRoot = join(__dirname, 'assets');

const koneko = new Koneko({
    isolateCount: 1,
    memoryLimit: 32,
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
