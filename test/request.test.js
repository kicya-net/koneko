import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsRoot = join(__dirname, 'assets');
const cliPath = join(__dirname, '..', 'src', 'http', 'cli.js');

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close((err) => (err ? reject(err) : resolve(port)));
        });
        server.on('error', reject);
    });
}

async function waitForServer(url, timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            await fetch(url);
            return;
        } catch {
            await wait(100);
        }
    }
    throw new Error(`Timed out waiting for server at ${url}`);
}

async function startCliServe() {
    const port = await getFreePort();
    const args = [cliPath, 'serve', assetsRoot, '--port', String(port)];

    const child = spawn(process.execPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
        stderr += chunk;
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(`${baseUrl}/`);

    async function close() {
        if (child.exitCode !== null) return;
        child.kill('SIGTERM');
        await Promise.race([
            new Promise((resolve) => child.once('exit', resolve)),
            wait(2000).then(() => {
                if (child.exitCode === null) child.kill('SIGKILL');
            }),
        ]);
    }

    return { baseUrl, close, getStderr: () => stderr };
}

describe('request object', () => {
    test('exposes method, url, path, headers, body, query, and cookies', async () => {
        const { baseUrl, close, getStderr } = await startCliServe();
        try {
            const response = await fetch(`${baseUrl}/request.cat?name=koneko&count=2`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-test-header': 'header-value',
                    cookie: 'session=abc123; theme=dark',
                },
                body: JSON.stringify({ hello: 'world', n: 1 }),
            });

            assert.equal(response.status, 200);
            const payload = JSON.parse(await response.text());

            assert.equal(payload.method, 'POST');
            assert.equal(payload.url, '/request.cat?name=koneko&count=2');
            assert.equal(payload.path, '/request.cat');
            assert.equal(payload.headerValue, 'header-value');
            assert.deepEqual(payload.body, {
                type: 'json',
                data: { hello: 'world', n: 1 },
            });
            assert.deepEqual(payload.query, {
                name: 'koneko',
                count: '2',
            });
            assert.deepEqual(payload.cookies, {
                session: 'abc123',
                theme: 'dark',
            });
        } finally {
            await close();
        }

        assert.equal(getStderr(), '');
    });

    test('exposes multipart form-data body fields', async () => {
        const { baseUrl, close, getStderr } = await startCliServe();
        try {
            const form = new FormData();
            form.set('title', 'koneko');
            form.set('count', '2');

            const response = await fetch(`${baseUrl}/form-data.cat`, {
                method: 'POST',
                body: form,
            });

            assert.equal(response.status, 200);
            const payload = JSON.parse(await response.text());

            assert.equal(payload.type, 'form-data');
            assert.deepEqual(payload.body, {
                title: 'koneko',
                count: '2',
            });
            assert.equal(payload.uploadIsArray, false);
            assert.equal(payload.uploadBinaryIsArray, false);
            assert.equal(payload.file, null);
            assert.equal(payload.binaryFile, null);
        } finally {
            await close();
        }

        assert.equal(getStderr(), '');
    });

    test('exposes multipart text file via lazy text()', async () => {
        const { baseUrl, close, getStderr } = await startCliServe();
        try {
            const form = new FormData();
            form.set('title', 'koneko');
            form.set('count', '2');
            form.set('upload', new Blob(['hello from file'], { type: 'text/plain' }), 'hello.txt');

            const response = await fetch(`${baseUrl}/form-data.cat`, {
                method: 'POST',
                body: form,
            });

            assert.equal(response.status, 200);
            const payload = JSON.parse(await response.text());

            assert.equal(payload.type, 'form-data');
            assert.deepEqual(payload.body, {
                title: 'koneko',
                count: '2',
            });
            assert.equal(payload.uploadIsArray, true);
            assert.equal(payload.uploadBinaryIsArray, false);
            assert.equal(payload.file.name, 'hello.txt');
            assert.equal(payload.file.mimetype, 'text/plain');
            assert.equal(payload.file.hasRead, true);
            assert.equal(payload.file.text, 'hello from file');
            assert.equal(typeof payload.file.size, 'number');
            assert.ok(payload.file.size > 0);
            assert.equal(payload.binaryFile, null);
        } finally {
            await close();
        }

        assert.equal(getStderr(), '');
    });

    test('exposes multipart binary file bytes via lazy read()', async () => {
        const { baseUrl, close, getStderr } = await startCliServe();
        try {
            const form = new FormData();
            form.set('title', 'koneko');
            form.set('count', '2');
            form.set(
                'uploadBinary',
                new Blob([new Uint8Array([0x01, 0x02, 0x03])], { type: 'application/octet-stream' }),
                'data.bin',
            );

            const response = await fetch(`${baseUrl}/form-data.cat`, {
                method: 'POST',
                body: form,
            });

            assert.equal(response.status, 200);
            const payload = JSON.parse(await response.text());

            assert.equal(payload.type, 'form-data');
            assert.equal(payload.uploadIsArray, false);
            assert.equal(payload.uploadBinaryIsArray, true);
            assert.equal(payload.binaryFile.name, 'data.bin');
            assert.equal(payload.binaryFile.mimetype, 'application/octet-stream');
            assert.equal(typeof payload.binaryFile.size, 'number');
            assert.ok(payload.binaryFile.size > 0);
            assert.deepEqual(payload.binaryFile.bytes, [1, 2, 3]);
        } finally {
            await close();
        }

        assert.equal(getStderr(), '');
    });

    test('exposes multiple files under one field as an array', async () => {
        const { baseUrl, close, getStderr } = await startCliServe();
        try {
            const form = new FormData();
            form.set('title', 'koneko');
            form.append('uploadMulti', new Blob(['first file'], { type: 'text/plain' }), 'first.txt');
            form.append('uploadMulti', new Blob(['second file'], { type: 'text/plain' }), 'second.txt');

            const response = await fetch(`${baseUrl}/form-data.cat`, {
                method: 'POST',
                body: form,
            });

            assert.equal(response.status, 200);
            const payload = JSON.parse(await response.text());

            assert.equal(payload.type, 'form-data');
            assert.equal(payload.uploadIsArray, false);
            assert.equal(payload.uploadBinaryIsArray, false);
            assert.ok(Array.isArray(payload.multiFiles));
            assert.equal(payload.multiFiles.length, 2);

            assert.deepEqual(payload.multiFiles[0], {
                name: 'first.txt',
                mimetype: 'text/plain',
                size: payload.multiFiles[0].size,
                text: 'first file',
            });
            assert.deepEqual(payload.multiFiles[1], {
                name: 'second.txt',
                mimetype: 'text/plain',
                size: payload.multiFiles[1].size,
                text: 'second file',
            });
            assert.equal(typeof payload.multiFiles[0].size, 'number');
            assert.equal(typeof payload.multiFiles[1].size, 'number');
            assert.ok(payload.multiFiles[0].size > 0);
            assert.ok(payload.multiFiles[1].size > 0);
        } finally {
            await close();
        }

        assert.equal(getStderr(), '');
    });
});
