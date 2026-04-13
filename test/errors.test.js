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

describe('render errors', () => {
    test('renderFile collapses template stack to the source file', async () => {
        await assert.rejects(async () => {
            await koneko.renderFile('plain-error.cat', {
                siteId: 'test-site-errors',
                siteRoot: assetsRoot,
                request: {},
            });
        }, (error) => {
            assert.match(error.stack, /^Error: test error\n    at \/plain-error\.cat:2:\d+$/);
            return true;
        });
    });

    test('renderCode collapses template stack to __template', async () => {
        await assert.rejects(async () => {
            await koneko.renderCode('<%\n    const a = 1;\n    throw new Error(\'test error\');\n%>', {
                siteId: 'test-site-errors',
                siteRoot: assetsRoot,
                request: {},
            });
        }, (error) => {
            assert.match(error.stack, /^Error: test error\n    at __template:3:\d+$/);
            return true;
        });
    });

    test('include errors keep the included template and caller frames', async () => {
        await assert.rejects(async () => {
            await koneko.renderFile('error.cat', {
                siteId: 'test-site-errors',
                siteRoot: assetsRoot,
                request: {},
            });
        }, (error) => {
            assert.match(
                error.stack,
                /^Error: include error\n    at \/_partials\/error\.cat:2:\d+\n    at \/error\.cat:3:\d+\n    at \/error\.cat:5:\d+$/,
            );
            return true;
        });
    });

    test('require errors keep the required module and caller frames', async () => {
        await assert.rejects(async () => {
            await koneko.renderFile('require/error.cat', {
                siteId: 'test-site-errors',
                siteRoot: assetsRoot,
                request: {},
            });
        }, (error) => {
            assert.match(
                error.stack,
                /^Error: require error\n    at \/require\/error\.js:2:\d+\n    at \/require\/error\.cat:2:\d+$/,
            );
            return true;
        });
    });
});
