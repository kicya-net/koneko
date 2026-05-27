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

await new Promise((resolve) => setTimeout(resolve, 500));

async function render(expr) {
    const { body, response } = await koneko.renderCode(`<%- ${expr} %>`, {
        siteId: 'test-site',
        siteRoot: assetsRoot,
        request: {},
    });
    assert.equal(response.status, 200);
    assert.equal(response.statusText, '');
    assert.deepEqual(response.headers, {});
    return body.trim();
}

describe('require("marked")', () => {
    test('marked() parses markdown to HTML', async () => {
        const out = await render('JSON.stringify(require("marked").marked("## Hello"))');
        assert.equal(JSON.parse(out), '<h2>Hello</h2>\n');
    });

    test('parse() parses markdown to HTML', async () => {
        const out = await render('JSON.stringify(require("marked").parse("**bold**"))');
        assert.equal(JSON.parse(out), '<p><strong>bold</strong></p>\n');
    });

    test('parseInline() renders inline markdown only', async () => {
        const out = await render('JSON.stringify(require("marked").parseInline("Hello **world**"))');
        assert.equal(JSON.parse(out), 'Hello <strong>world</strong>');
    });

    test('lexer() returns heading token data', async () => {
        const out = await render('JSON.stringify(require("marked").lexer("# Title"))');
        const tokens = JSON.parse(out);
        const token = tokens[0];
        assert.equal(token.type, 'heading');
        assert.equal(token.depth, 1);
        assert.equal(token.text, 'Title');
    });
});
