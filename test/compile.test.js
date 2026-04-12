import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { compileTemplate } from '../src/compile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function render(source, request = {}) {
    const code = compileTemplate(source);
    const result = await eval(`(async () => { ${code}; return await __template(${JSON.stringify(request)}); })()`);
    return result.body;
}

describe('compile()', () => {
    test('assigns an async template function with echo pipeline', () => {
        const out = compileTemplate('hi');
        assert.match(out, /^globalThis\.__template = async function\(req, filePath\) \{/);
        assert.match(out, /return \{ body: __k\.join\(""\), response: \{.+?\};\n\}$/);
    });

    test('plain HTML is pushed as a single quoted chunk', async () => {
        const html = '<p>plain</p>';
        assert.equal(await render(html), html);
    });

    test('static HTML escapes quotes and newlines in generated JS', async () => {
        const html = "a\nb'c\\d";
        assert.equal(await render(html), html);
    });

    test('<%= escapes HTML entities', async () => {
        assert.equal(
            await render('<%= "<>&\\"" %>'),
            '&lt;&gt;&amp;&quot;'
        );
    });

    test('<%= null and undefined become empty string', async () => {
        assert.equal(await render('<%= null %><%= undefined %>'), '');
    });

    test('<%- outputs raw HTML', async () => {
        assert.equal(await render('<%- "<b>ok</b>" %>'), '<b>ok</b>');
    });

    test('code block runs and can loop', async () => {
        const src = `<% for (let i = 0; i < 3; i++) { %>n<%= i %><% } %>`;
        assert.equal(await render(src), 'n0n1n2');
    });

    test('echo is available inside code blocks', async () => {
        assert.equal(await render(`<% echo("x"); echo("y"); %>`), 'xy');
    });

    test('multiple segments preserve order', async () => {
        assert.equal(await render('a<% echo("1"); %>b<%= 2 %>c'), 'a1b2c');
    });

    test('unclosed <% throws', () => {
        assert.throws(() => compileTemplate('before <% no close'), {
            message: /Unclosed <% tag at \d+/,
        });
    });

    test('%> inside JS string does not end the tag early (double quotes)', async () => {
        const src = `<% const s = "%>"; echo(s); %>done`;
        assert.equal(await render(src), '%>done');
    });

    test('%> inside JS string does not end the tag early (single quotes)', async () => {
        const src = `<% const s = '%>'; echo(s); %>done`;
        assert.equal(await render(src), '%>done');
    });

    test('%> inside JS string does not end the tag early (backticks)', async () => {
        const src = `<% const s = \`%>\`; echo(s); %>done`;
        assert.equal(await render(src), '%>done');
    });

    test('%> inside JS string does not end the tag early (backticks with newline)', async () => {
        const src = `<% const s = \`\n%>\`; echo(s); %>done`;
        assert.equal(await render(src), '\n%>done');
    });

    test('%> inside JS one-line comment does not end the tag early', async () => {
        const src = `<%- // comment %>
        1 %> done`;
        assert.equal(await render(src), '1 done');
    });

    test('%> inside JS multi-line comment does not end the tag early', async () => {
        const src = `<% /* comment %> */ %>done`;
        assert.equal(await render(src), 'done');
    });

    test('sample index.cat renders expected structure', async () => {
        const path = join(__dirname, 'assets', 'index.cat');
        const content = await readFile(path, 'utf8');
        const out = await render(content);
        assert.match(out, /<h1>Hello, World!<\/h1>/);
        assert.match(out, /<p>Test #0<\/p>/);
        assert.match(out, /<p>Test #9<\/p>/);
        assert.doesNotMatch(out, /Test #10/);
    });
});
