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

async function renderCode(code) {
    const { body, response } = await koneko.renderCode(code, {
        siteId: 'test-site-text',
        siteRoot: assetsRoot,
        request: {},
    });
    assert.equal(response.status, 200);
    assert.equal(response.statusText, '');
    assert.deepEqual(response.headers, {});
    return body.trim();
}

describe('TextEncoder and TextDecoder', () => {
    test('encode UTF-8 bytes and decode them back', async () => {
        const out = await renderCode(`
            <%
                const encoded = new TextEncoder().encode("hello ✓");
                const decoded = new TextDecoder("utf-8").decode(encoded);
            %>
            <%- JSON.stringify({
                bytes: Array.from(encoded),
                decoded,
            }) %>
        `);

        assert.deepEqual(JSON.parse(out), {
            bytes: [104, 101, 108, 108, 111, 32, 226, 156, 147],
            decoded: 'hello ✓',
        });
    });

    test('decode UTF-16LE from an ArrayBuffer', async () => {
        const out = await renderCode(`
            <%
                const bytes = new Uint8Array([65, 0, 66, 0]);
                const decoded = new TextDecoder("utf-16le").decode(bytes.buffer);
            %>
            <%= decoded %>
        `);

        assert.equal(out, 'AB');
    });

    test('strips UTF-8 BOM by default', async () => {
        const out = await renderCode(`
            <%
                const bytes = new Uint8Array([239, 187, 191, 111, 107]);
                const decoded = new TextDecoder().decode(bytes);
            %>
            <%= decoded %>
        `);

        assert.equal(out, 'ok');
    });
});
