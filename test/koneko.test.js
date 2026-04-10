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
});

await new Promise(resolve => setTimeout(resolve, 500));

describe('Koneko', () => {
    test('renders index.cat with expected HTML', async () => {
        const out = await koneko.renderFile('index.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });

        assert.match(out, /<h1>Hello, World!<\/h1>/);
        assert.match(out, /<p>Test #0<\/p>/);
        assert.match(out, /<p>Test #9<\/p>/);
        assert.doesNotMatch(out, /Test #10/);
    });

    test('terminates while(true) loop', async () => {
        await assert.rejects(async () => {
            await koneko.renderFile('while-true.cat', {
                siteId: 'test-site',
                siteRoot: assetsRoot,
                request: {},
            });
        }, {
            message: /CPU limit exceeded/,
        });
    });

    test('terminates memory limit', async () => {
        await assert.rejects(async () => {
            await koneko.renderFile('memory-limit.cat', {
                siteId: 'test-site',
                siteRoot: assetsRoot,
                request: {},
            });
        }, {
            message: /Array buffer allocation failed/,
        });
    });
});
