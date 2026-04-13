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

async function renderCode(code, request = {}) {
    const { body, response } = await koneko.renderCode(code, {
        siteId: 'test-site-url',
        siteRoot: assetsRoot,
        request,
    });
    assert.equal(response.status, 200);
    assert.equal(response.statusText, '');
    assert.deepEqual(response.headers, {});
    return body.trim();
}

describe('URL and URLSearchParams', () => {
    test('parse request URLs and build query strings', async () => {
        const out = await renderCode(`
            <%
                const url = new URL(request.url, "http://localhost");
                url.searchParams.set("lang", "en");
                const params = new URLSearchParams({ q: "hello world", page: 2 });
            %>
            <%- JSON.stringify({
                pathname: url.pathname,
                name: url.searchParams.get("name"),
                href: url.href,
                params: params.toString(),
            }) %>
        `, {
            url: '/hello?name=cat',
        });

        assert.deepEqual(JSON.parse(out), {
            pathname: '/hello',
            name: 'cat',
            href: 'http://localhost/hello?name=cat&lang=en',
            params: 'q=hello+world&page=2',
        });
    });

    test('preserves duplicate params and supports targeted delete', async () => {
        const out = await renderCode(`
            <%
                const params = new URLSearchParams("tag=a&tag=b&tag=c");
                params.delete("tag", "b");
            %>
            <%- JSON.stringify({
                all: params.getAll("tag"),
                hasA: params.has("tag", "a"),
                hasB: params.has("tag", "b"),
                value: params.toString(),
            }) %>
        `);

        assert.deepEqual(JSON.parse(out), {
            all: ['a', 'c'],
            hasA: true,
            hasB: false,
            value: 'tag=a&tag=c',
        });
    });

    test('normalizes href, search, and hash mutations', async () => {
        const out = await renderCode(`
            <%
                const url = new URL("https://example.com/path");
                url.search = "a=1";
                url.hash = "top";
            %>
            <%- JSON.stringify({
                search: url.search,
                hash: url.hash,
                href: url.href,
                canParse: URL.canParse("/x", "https://example.com"),
            }) %>
        `);

        assert.deepEqual(JSON.parse(out), {
            search: '?a=1',
            hash: '#top',
            href: 'https://example.com/path?a=1#top',
            canParse: true,
        });
    });
});
