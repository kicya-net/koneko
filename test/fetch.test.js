import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { safeFetch } from '../src/api/net.js';

describe('safeFetch', () => {
    test('rejects invalid URL', async () => {
        await assert.rejects(() => safeFetch('not a url'), {
            message: 'Invalid URL',
        });
    });

    test('rejects non-HTTP(S) protocols', async () => {
        await assert.rejects(() => safeFetch('ftp://example.com/'), {
            message: 'Only HTTP and HTTPS are allowed',
        });
    });

    test('rejects loopback IPv4 in URL', async () => {
        await assert.rejects(() => safeFetch('http://127.0.0.1/'), {
            message: 'Fetching private/internal IPs is not allowed',
        });
    });

    test('rejects private IPv4 in URL', async () => {
        await assert.rejects(() => safeFetch('http://10.0.0.1/'), {
            message: 'Fetching private/internal IPs is not allowed',
        });
        await assert.rejects(() => safeFetch('http://192.168.0.1/'), {
            message: 'Fetching private/internal IPs is not allowed',
        });
    });

    test('rejects loopback IPv6 in URL', async () => {
        await assert.rejects(() => safeFetch('http://[::1]/'), {
            message: 'Fetching private/internal IPs is not allowed',
        });
    });

    test('rejects IPv4-mapped loopback in IPv6 URL', async () => {
        await assert.rejects(() => safeFetch('http://[::ffff:127.0.0.1]/'), {
            message: 'Fetching private/internal IPs is not allowed',
        });
    });

    test('rejects link-local / metadata-style addresses in URL', async () => {
        await assert.rejects(() => safeFetch('http://169.254.169.254/'), {
            message: 'Fetching private/internal IPs is not allowed',
        });
    });

    test('fetches a public HTTPS URL', async () => {
        const res = await safeFetch('https://example.com/');
        assert.equal(res.ok, true);
        assert.equal(res.status, 200);
        assert.match(res.bodyText, /Example Domain/i);
    });
});
