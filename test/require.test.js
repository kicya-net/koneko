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

await new Promise(resolve => setTimeout(resolve, 500));

describe('require()', () => {
    test('does not expose path as a global to templates', async () => {
        const { body, response } = await koneko.renderCode('<%= typeof path %>', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.equal(body.trim(), 'undefined');
    });

    test('loads and executes a basic module', async () => {
        const { body, response } = await koneko.renderFile('require.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.equal(body.trim(), 'test');
    });

    test('supports module.exports reassignment', async () => {
        const { body, response } = await koneko.renderFile('require/module-exports.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.equal(body.trim(), 'ok');
    });

    test('caches module execution across normalized equivalent paths', async () => {
        const { body, response } = await koneko.renderFile('require/cache-and-normalize.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.equal(body.trim(), '1:1:1:changed');
    });

    test('resolves nested module relatives from the module directory', async () => {
        const { body, response } = await koneko.renderFile('require/nested-relative.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.equal(body.trim(), '42');
    });

    test('handles circular requires without infinite recursion', async () => {
        const { body, response } = await koneko.renderFile('require/looping.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.equal(body.trim(), 'a:b:b:object');
    });

    test('routes console.log from required modules into the active response', async () => {
        const { body, response } = await koneko.renderFile('require/console-log.cat', {
            siteId: 'test-site',
            siteRoot: assetsRoot,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.match(body, /<h1>Module Log<\/h1>/);
        assert.match(body, /"from module"/);
        assert.match(body, /"ok":true/);
        assert.match(body, /console\[entry\.level\]/);
    });
});
