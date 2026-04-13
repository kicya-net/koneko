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
    const { body, response } = await koneko.renderCode(`<%= ${expr} %>`, {
        siteId: 'test-site',
        siteRoot: assetsRoot,
        request: {},
    });
    assert.equal(response.status, 200);
    assert.equal(response.statusText, '');
    assert.deepEqual(response.headers, {});
    return body.trim();
}

describe('require("path")', () => {
    test('exposes a frozen module', async () => {
        const out = await render('Object.isFrozen(require("path"))');
        assert.equal(out, 'true');
    });

    test('dirname returns the path prefix up to and including the last slash', async () => {
        assert.equal(await render('require("path").dirname("/a/b/c")'), '/a/b/');
        assert.equal(await render('require("path").dirname("/a/b/c/")'), '/a/b/c/');
    });

    test('dirname returns empty string when there is no slash', async () => {
        assert.equal(await render('require("path").dirname("file.cat")'), '');
    });

    test('dirname of a single top-level segment returns root slash', async () => {
        assert.equal(await render('require("path").dirname("/x")'), '/');
    });

    test('resolve treats an absolute target as starting at root', async () => {
        const out = await render('require("path").resolve("/any/base", "/abs/here")');
        assert.equal(out, '/abs/here');
    });

    test('resolve joins base and relative segments and normalizes dot segments', async () => {
        const out = await render('require("path").resolve("/a/b/", "../c/./d")');
        assert.equal(out, '/a/c/d');
    });

    test('join builds an absolute path from segments rooted at /', async () => {
        const out = await render('require("path").join("a", "b", "..", "c")');
        assert.equal(out, '/a/c');
    });

    test('join of multiple parts matches resolve from root', async () => {
        const out = await render('require("path").join("x", "y", "z")');
        assert.equal(out, '/x/y/z');
    });

    test('resolveRequire resolves a relative path from the directory of the requiring file', async () => {
        const out = await render('require("path").resolveRequire("/folder/mod.js", "./sibling.cat")');
        assert.equal(out, '/folder/sibling.cat');
    });

    test('resolveRequire handles parent-relative requires', async () => {
        const out = await render('require("path").resolveRequire("/a/b/c/file.js", "../d")');
        assert.equal(out, '/a/b/d');
    });
});
