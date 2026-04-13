import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';

import { createFsBridge } from '../src/api/fs.js';
import { Koneko } from '../src/koneko.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = fs.mkdtempSync(join(__dirname, 'tmp-fs-site-'));

fs.mkdirSync(join(siteRoot, 'sub'), { recursive: true });
fs.writeFileSync(join(siteRoot, 'hello.txt'), 'hello utf8', 'utf8');
fs.writeFileSync(join(siteRoot, 'sub', 'bin.dat'), Buffer.from([0, 1, 2, 255]));

const koneko = new Koneko({
    isolateCount: 1,
    memoryLimit: 32,
    cpuTimeout: 50,
});

await new Promise((resolve) => setTimeout(resolve, 500));

after(() => {
    fs.rmSync(siteRoot, { recursive: true, force: true });
});

async function renderCode(code) {
    const { body, response } = await koneko.renderCode(code, {
        siteId: 'test-site-fs',
        siteRoot,
        request: {},
    });
    assert.equal(response.status, 200);
    assert.equal(response.statusText, '');
    assert.deepEqual(response.headers, {});
    return body.trim();
}

describe('require("fs")', () => {
    test('exposes a frozen module', async () => {
        const out = await renderCode('<%= Object.isFrozen(require("fs")) %>');
        assert.equal(out, 'true');
    });

    test('readFile with utf8 returns text', async () => {
        const out = await renderCode('<%= await require("fs").readFile("hello.txt", "utf8") %>');
        assert.equal(out, 'hello utf8');
    });

    test('readFile with utf-8 returns text', async () => {
        const out = await renderCode('<%= await require("fs").readFile("hello.txt", "utf-8") %>');
        assert.equal(out, 'hello utf8');
    });

    test('readFile without utf8 encoding returns ArrayBuffer', async () => {
        const code = '<% const ab = await require("fs").readFile("hello.txt"); const u = new Uint8Array(ab); %>'
            + '<%= u.length %>:<%= u[0] %>:<%= u[4] %>';
        const out = await renderCode(code);
        assert.equal(out, '10:104:111');
    });

    test('readFile binary file yields correct bytes', async () => {
        const code = '<% const ab = await require("fs").readFile("sub/bin.dat"); const u = new Uint8Array(ab); %>'
            + '<%= u[0] %>:<%= u[3] %>';
        const out = await renderCode(code);
        assert.equal(out, '0:255');
    });

    test('readdir lists entries with flags', async () => {
        const code = '<% const e = await require("fs").readdir("."); %>'
            + '<%= e.map((x) => x.name + ":" + x.isFile).sort().join(",") %>';
        const out = await renderCode(code);
        assert.match(out, /hello\.txt:true/);
        assert.match(out, /sub:false/);
    });

    test('stat returns size and booleans', async () => {
        const code = '<% const s = await require("fs").stat("hello.txt"); %>'
            + '<%= s.size %>:<%= s.isFile %>:<%= s.isDirectory %>';
        const out = await renderCode(code);
        assert.equal(out, '10:true:false');
    });

    test('writeFile then readFile round-trip', async () => {
        const code = '<% await require("fs").writeFile("wrote.txt", "x"); %>'
            + '<%= await require("fs").readFile("wrote.txt", "utf8") %>';
        const out = await renderCode(code);
        assert.equal(out, 'x');
        assert.equal(fs.readFileSync(join(siteRoot, 'wrote.txt'), 'utf8'), 'x');
    });

    test('writeFile accepts Uint8Array', async () => {
        const code = '<% const u = new Uint8Array([7, 8]); await require("fs").writeFile("u8.bin", u); %>'
            + '<% const ab = await require("fs").readFile("u8.bin"); const x = new Uint8Array(ab); %>'
            + '<%= x[0] %>:<%= x[1] %>';
        const out = await renderCode(code);
        assert.equal(out, '7:8');
    });

    test('mkdir creates nested directory', async () => {
        const code = '<% await require("fs").mkdir("a/b", { recursive: true }); %>'
            + '<%= (await require("fs").stat("a/b")).isDirectory %>';
        const out = await renderCode(code);
        assert.equal(out, 'true');
    });

    test('rename moves a file', async () => {
        fs.writeFileSync(join(siteRoot, 'mv-from.txt'), 'mv', 'utf8');
        const code = '<% await require("fs").rename("mv-from.txt", "nested/mv-to.txt"); %>'
            + '<%= await require("fs").readFile("nested/mv-to.txt", "utf8") %>';
        const out = await renderCode(code);
        assert.equal(out, 'mv');
        assert.ok(!fs.existsSync(join(siteRoot, 'mv-from.txt')));
    });

    test('rm removes a file', async () => {
        fs.writeFileSync(join(siteRoot, 'del.txt'), 'd', 'utf8');
        const code = '<% await require("fs").rm("del.txt"); %>ok';
        const out = await renderCode(code);
        assert.equal(out, 'ok');
        assert.ok(!fs.existsSync(join(siteRoot, 'del.txt')));
    });
});

describe('createFsBridge (host)', () => {
    test('readFile rejects paths that escape site root', async () => {
        const root = fs.mkdtempSync(join(tmpdir(), 'koneko-fs-guard-'));
        try {
            const fsBridge = createFsBridge(root);
            await assert.rejects(
                () => fsBridge('readFile', '../package.json', 'utf8'),
                /Invalid file path/,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
