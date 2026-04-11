import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import cookie from 'cookie';

import { applyResponseHeaders } from '../src/http/utils.js';

function createMockResponse() {
    const headers = {};
    return {
        headers,
        set(name, value) {
            headers[name] = value;
        },
    };
}

function withEnv(name, value, fn) {
    const prev = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;

    try {
        return fn();
    } finally {
        if (prev === undefined) delete process.env[name];
        else process.env[name] = prev;
    }
}

describe('applyResponseHeaders', () => {
    test('removes Domain from single Set-Cookie in sandbox mode', () => {
        const res = createMockResponse();

        withEnv('SANDBOX_DOMAIN', '1', () => {
            applyResponseHeaders(res, {
                'Set-Cookie': 'session=abc; Domain=.example.com; Path=/; HttpOnly; SameSite=None; Secure',
                'X-Test': 'ok',
            });
        });

        const parsed = cookie.parseSetCookie(res.headers['Set-Cookie']);
        assert.equal(parsed.name, 'session');
        assert.equal(parsed.value, 'abc');
        assert.equal(parsed.path, '/');
        assert.equal(parsed.httpOnly, true);
        assert.equal(parsed.sameSite, 'none');
        assert.equal(parsed.secure, true);
        assert.equal(parsed.domain, undefined);
        assert.equal(res.headers['X-Test'], 'ok');
    });

    test('removes Domain from each Set-Cookie entry array', () => {
        const res = createMockResponse();

        withEnv('SANDBOX_DOMAIN', '1', () => {
            applyResponseHeaders(res, {
                'set-cookie': [
                    'sid=123; DOMAIN=.example.com; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Path=/app; HttpOnly',
                    '__Host-token=abc; Domain=.example.com; Path=/; Secure',
                    'theme=dark; Path=/; SameSite=Lax',
                ],
            });
        });

        assert.ok(Array.isArray(res.headers['set-cookie']));
        assert.equal(res.headers['set-cookie'].length, 3);

        const sid = cookie.parseSetCookie(res.headers['set-cookie'][0]);
        const hostToken = cookie.parseSetCookie(res.headers['set-cookie'][1]);
        const theme = cookie.parseSetCookie(res.headers['set-cookie'][2]);

        assert.equal(sid.name, 'sid');
        assert.equal(sid.domain, undefined);
        assert.equal(sid.path, '/app');
        assert.equal(sid.httpOnly, true);
        assert.ok(sid.expires instanceof Date);

        assert.equal(hostToken.name, '__Host-token');
        assert.equal(hostToken.domain, undefined);
        assert.equal(hostToken.path, '/');
        assert.equal(hostToken.secure, true);

        assert.equal(theme.name, 'theme');
        assert.equal(theme.value, 'dark');
        assert.equal(theme.domain, undefined);
        assert.equal(theme.path, '/');
        assert.equal(theme.sameSite, 'lax');
    });

    test('does not modify Set-Cookie when sandbox mode is disabled', () => {
        const res = createMockResponse();
        const original = 'session=abc; Domain=.example.com; Path=/; HttpOnly';

        withEnv('SANDBOX_DOMAIN', undefined, () => {
            applyResponseHeaders(res, {
                'Set-Cookie': original,
            });
        });

        assert.equal(res.headers['Set-Cookie'], original);
    });
});
