import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
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

async function startCliServe(clean, { cwd, port, siteRoot = assetsRoot, publicDir, sqliteDir, threads = 1 } = {}) {
    port ??= await getFreePort();
    const args = [cliPath, 'serve', siteRoot, '--port', String(port), '--threads', String(threads)];
    if (clean) args.push('--clean');
    if (publicDir != null) args.push('--public', publicDir);
    if (sqliteDir) args.push('--sqlite-dir', sqliteDir);

    const child = spawn(process.execPath, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
        stdout += chunk;
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

    return { baseUrl, close, getStderr: () => stderr, getStdout: () => stdout };
}

describe('CLI serve', () => {
    test('clean off serves / and /index.cat, but not /index', async () => {
        const { baseUrl, close, getStderr } = await startCliServe(false, { publicDir: '.' });
        try {
            const root = await fetch(`${baseUrl}/`);
            assert.equal(root.status, 200);
            assert.match(await root.text(), /<h1>Hello, World!<\/h1>/);

            const explicit = await fetch(`${baseUrl}/index.cat`);
            assert.equal(explicit.status, 200);
            assert.match(await explicit.text(), /<h1>Hello, World!<\/h1>/);

            const cleanRoute = await fetch(`${baseUrl}/index`);
            assert.equal(cleanRoute.status, 404);
        } finally {
            await close();
        }

        assert.equal(getStderr(), '');
    });

    test('clean on also serves extensionless /index', async () => {
        const { baseUrl, close, getStderr } = await startCliServe(true, { publicDir: '.' });
        try {
            const root = await fetch(`${baseUrl}/`);
            assert.equal(root.status, 200);
            assert.match(await root.text(), /<h1>Hello, World!<\/h1>/);

            const explicit = await fetch(`${baseUrl}/index.cat`);
            assert.equal(explicit.status, 200);
            assert.match(await explicit.text(), /<h1>Hello, World!<\/h1>/);

            const cleanRoute = await fetch(`${baseUrl}/index`);
            assert.equal(cleanRoute.status, 200);
            assert.match(await cleanRoute.text(), /<h1>Hello, World!<\/h1>/);
        } finally {
            await close();
        }

        assert.equal(getStderr(), '');
    });

    test('body.cat renders request body for POST (application/json)', async () => {
        const { baseUrl, close, getStderr } = await startCliServe(false, { publicDir: '.' });
        try {
            const resp = await fetch(`${baseUrl}/body.cat`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ test: 1 }),
            });
            assert.equal(resp.status, 200);
            const text = await resp.text();
            assert.match(text, /^POST\s+{\"test\":1}/);
        } finally {
            await close();
        }
        assert.equal(getStderr(), '');
    });

    test('relative --sqlite-dir resolves from the process cwd', async () => {
        const cwd = fs.mkdtempSync(join(__dirname, '.koneko-serve-cwd-'));
        const siteRoot = fs.mkdtempSync(join(__dirname, '.koneko-serve-site-'));
        fs.cpSync(assetsRoot, siteRoot, { recursive: true });

        const { baseUrl, close, getStderr } = await startCliServe(false, {
            cwd,
            siteRoot,
            publicDir: '.',
            sqliteDir: 'dbs',
        });

        try {
            const resp = await fetch(`${baseUrl}/sqlite.cat`);
            assert.equal(resp.status, 200);
            assert.match(await resp.text(), /"koneko"/);
            assert.equal(fs.existsSync(join(cwd, 'dbs', 'main.sqlite')), true);
            assert.equal(fs.existsSync(join(siteRoot, 'dbs')), false);
        } finally {
            await close();
            fs.rmSync(cwd, { recursive: true, force: true });
            fs.rmSync(siteRoot, { recursive: true, force: true });
        }

        assert.equal(getStderr(), '');
    });

    test('defaults to public/ routing while keeping private project files accessible', async () => {
        const siteRoot = fs.mkdtempSync(join(__dirname, '.koneko-serve-public-'));
        fs.mkdirSync(join(siteRoot, 'public'));
        fs.mkdirSync(join(siteRoot, 'lib'));
        fs.mkdirSync(join(siteRoot, 'partials'));
        fs.writeFileSync(join(siteRoot, 'public', 'index.cat'), `<%
await include('../partials/header.cat');
const message = require('../lib/message.js');
%>
<p><%= message %></p>
`);
        fs.writeFileSync(join(siteRoot, 'partials', 'header.cat'), '<h1>private partial</h1>\n');
        fs.writeFileSync(join(siteRoot, 'lib', 'message.js'), `module.exports = 'private module';\n`);

        const { baseUrl, close, getStderr } = await startCliServe(false, {
            siteRoot,
        });

        try {
            const root = await fetch(`${baseUrl}/`);
            assert.equal(root.status, 200);
            const body = await root.text();
            assert.match(body, /<h1>private partial<\/h1>/);
            assert.match(body, /<p>private module<\/p>/);

            const privateFile = await fetch(`${baseUrl}/lib/message.cat`);
            assert.equal(privateFile.status, 404);
        } finally {
            await close();
            fs.rmSync(siteRoot, { recursive: true, force: true });
        }

        assert.equal(getStderr(), '');
    });

    test('--public serves a custom routed directory from a relative path', async () => {
        const siteRoot = fs.mkdtempSync(join(__dirname, '.koneko-serve-www-'));
        fs.mkdirSync(join(siteRoot, 'www'));
        fs.writeFileSync(join(siteRoot, 'www', 'index.cat'), '<h1>custom public dir</h1>\n');

        const { baseUrl, close, getStderr } = await startCliServe(false, {
            siteRoot,
            publicDir: 'www',
        });

        try {
            const root = await fetch(`${baseUrl}/`);
            assert.equal(root.status, 200);
            assert.match(await root.text(), /<h1>custom public dir<\/h1>/);
        } finally {
            await close();
            fs.rmSync(siteRoot, { recursive: true, force: true });
        }

        assert.equal(getStderr(), '');
    });

    test('_catchall.cat handles unmatched routes and prefers deeper matches', async () => {
        const siteRoot = fs.mkdtempSync(join(__dirname, '.koneko-serve-catchall-'));
        fs.mkdirSync(join(siteRoot, 'public'));
        fs.mkdirSync(join(siteRoot, 'public', 'api'));
        fs.writeFileSync(join(siteRoot, 'public', '_catchall.cat'), '<p>root catchall</p>\n');
        fs.writeFileSync(join(siteRoot, 'public', 'api', '_catchall.cat'), '<p>api catchall</p>\n');
        fs.writeFileSync(join(siteRoot, 'public', 'api', 'users.cat'), '<p>users exact</p>\n');

        const { baseUrl, close, getStderr } = await startCliServe(false, {
            siteRoot,
        });

        try {
            const rootCatchall = await fetch(`${baseUrl}/missing-route`);
            assert.equal(rootCatchall.status, 200);
            assert.match(await rootCatchall.text(), /<p>root catchall<\/p>/);

            const nestedCatchall = await fetch(`${baseUrl}/api/missing-route`);
            assert.equal(nestedCatchall.status, 200);
            assert.match(await nestedCatchall.text(), /<p>api catchall<\/p>/);

            const exact = await fetch(`${baseUrl}/api/users.cat`);
            assert.equal(exact.status, 200);
            assert.match(await exact.text(), /<p>users exact<\/p>/);
        } finally {
            await close();
            fs.rmSync(siteRoot, { recursive: true, force: true });
        }

        assert.equal(getStderr(), '');
    });
});
