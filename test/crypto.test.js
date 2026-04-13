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

describe('require("crypto")', () => {
    test('exposes a frozen module', async () => {
        const out = await render('Object.isFrozen(require("crypto"))');
        assert.equal(out, 'true');
    });

    test('sha256 digests UTF-8 strings to hex', async () => {
        const out = await render('require("crypto").sha256("hello")');
        assert.equal(
            out,
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        );
    });

    test('sha512 digests UTF-8 strings to hex', async () => {
        const out = await render('require("crypto").sha512("hello")');
        assert.equal(
            out,
            '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043',
        );
    });

    test('sha1 digests UTF-8 strings to hex', async () => {
        const out = await render('require("crypto").sha1("hello")');
        assert.equal(out, 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    });

    test('md5 digests UTF-8 strings to hex', async () => {
        const out = await render('require("crypto").md5("hello")');
        assert.equal(out, '5d41402abc4b2a76b9719d911017c592');
    });

    test('hmacSha256 returns hex', async () => {
        const out = await render('require("crypto").hmacSha256("k", "m")');
        assert.equal(
            out,
            'b60090e3052297aeb5a080889ce2fc4bca957e756faeb4df7d31800ca1e771ec',
        );
    });

    test('hmacSha512 returns hex', async () => {
        const out = await render('require("crypto").hmacSha512("k", "m")');
        assert.equal(
            out,
            '94ec958658ae2d2e92ae742007904d439af3a5509156f6ad5bd0bab74868b4cbb7cbc817162b11e4aff59813415a730e9720fc5ff1d1015a1f7d1b67fb047d87',
        );
    });

    test('randomBytes returns a Uint8Array of the requested length', async () => {
        const tpl = '<% const u = require("crypto").randomBytes(16); %>'
            + '<%= u instanceof Uint8Array %>:<%= u.length %>';
        const { body, response } = await koneko.renderCode(tpl, {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        const [isU8, len] = body.trim().split(':');
        assert.equal(isU8, 'true');
        assert.equal(len, '16');
    });

    test('randomUUID returns an RFC 4122 UUID string', async () => {
        const out = await render('require("crypto").randomUUID()');
        assert.match(
            out,
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });

    test('timingSafeEqual returns true for identical strings', async () => {
        const out = await render('require("crypto").timingSafeEqual("secret", "secret")');
        assert.equal(out, 'true');
    });

    test('timingSafeEqual returns false for different strings of the same length', async () => {
        const out = await render('require("crypto").timingSafeEqual("secret", "secreu")');
        assert.equal(out, 'false');
    });

    test('timingSafeEqual returns false when lengths differ', async () => {
        const out = await render('require("crypto").timingSafeEqual("a", "ab")');
        assert.equal(out, 'false');
    });
});
