import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsRoot = join(__dirname, 'assets');
const cliPath = join(__dirname, '..', 'src', 'http', 'cli.js');

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

async function startCliServe(clean, { cwd, port = 13333, siteRoot = assetsRoot, sqliteDir, threads = 1 } = {}) {
    const args = [cliPath, 'serve', siteRoot, '--port', String(port), '--threads', String(threads)];
    if (clean) args.push('--clean');
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
        const { baseUrl, close, getStderr } = await startCliServe(false);
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
        const { baseUrl, close, getStderr } = await startCliServe(true);
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
        const { baseUrl, close, getStderr } = await startCliServe(false);
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
            port: 13334,
            siteRoot,
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
});
