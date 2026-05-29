/*
Copyright 2026 Kicya

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import ivm from 'isolated-vm';
import fileUpload from 'express-fileupload';
import express from 'ultimate-express';
import cookie from 'cookie';
import fs from 'node:fs';
import path from 'node:path';

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function buildDebugReplayScript(debugLogs) {
    if(!debugLogs || !debugLogs.length) return '';
    const payload = JSON.stringify(debugLogs)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    return `<script>(function(){const entries=${payload};for(const entry of entries){const fn=console[entry.level]||console.log;fn(...entry.args);}})();document.currentScript.remove();</script>`;
}

export function generateError(status, message, debugLogs) {
    const scriptTag = buildDebugReplayScript(debugLogs);
    return `<!DOCTYPE html><html><body><h1>Error ${status}</h1><pre>${escapeHtml(message)}</pre><hr><i>Koneko</i>${scriptTag}</body></html>`;
}

export async function sendErrorPage({ req, res, koneko, siteId, siteRoot, publicPath, sqliteDir = null, status, error }) {
    const message = error?.message ?? (status === 404 ? 'Not found' : String(error ?? 'Internal server error'));
    const fallbackMessage = error?.stack ?? message;
    const errorFilePath = path.join(publicPath, '_error.cat');

    try {
        const stat = await fs.promises.stat(errorFilePath);
        if(!stat.isFile()) {
            return res.status(status).send(generateError(status, fallbackMessage, error?.debugLogs));
        }
    } catch(err) {
        if(err.code !== 'ENOENT') throw err;
        return res.status(status).send(generateError(status, fallbackMessage, error?.debugLogs));
    }

    try {
        const renderFilePath = path.relative(siteRoot, errorFilePath).replace(/\\/g, '/');
        const errorLocal = { code: status, message };
        if(error?.stack) errorLocal.stack = error.stack;
        const body = await koneko.renderFile(renderFilePath, {
            siteId,
            siteRoot,
            sqliteDir,
            request: buildRequest(req),
            locals: { error: errorLocal },
        });
        applyResponseHeaders(res, body.response.headers);
        res.status(body.response.status);
        return res.send(body.body);
    } catch(err) {
        console.error(err);
        return res.status(status).send(generateError(status, fallbackMessage, error?.debugLogs));
    }
}

export function konekoHelpers(limit) {
    const raw = express.raw({ type: '*/*', limit });
    const json = express.json({ limit });
    const urlencoded = express.urlencoded({ extended: false, limit });
    const text = express.text({ type: '*/*', limit });
    const upload = fileUpload({
        limits: { fileSize: limit },
        abortOnLimit: true,
        limitHandler: (req, res, next) => {
            return res.status(413).send(generateError(413, 'File too large'));
        }
    });

    return (req, res, next) => {
        if (req.body !== undefined) return next();
        if(!req.cookies) req.cookies = cookie.parse(req.headers.cookie ?? '');

        const ct = req.get('content-type') ?? '';

        if (ct.includes('multipart/form-data')) {
            return upload(req, res, next);
        }
        if (ct.includes('application/json')) {
            return json(req, res, next);
        }
        if (ct.includes('application/x-www-form-urlencoded')) {
            return urlencoded(req, res, next);
        }
        if (ct.includes('text/')) {
            return text(req, res, next);
        }
        return raw(req, res, next);
    };
}

export function applyResponseHeaders(res, headers) {
    const sandboxDomain = Boolean(process.env.SANDBOX_DOMAIN);

    for (const name in headers) {
        let value = headers[name];

        if (sandboxDomain && name.toLowerCase() === 'set-cookie') {
            if (Array.isArray(value)) {
                value = value.map(cookieHeader => {
                    const parsed = cookie.parseSetCookie(String(cookieHeader));
                    if (!parsed) return cookieHeader;
                    delete parsed.domain;
                    return cookie.stringifySetCookie(parsed);
                });
            } else if (typeof value === 'string') {
                const parsed = cookie.parseSetCookie(value);
                if (parsed) {
                    delete parsed.domain;
                    value = cookie.stringifySetCookie(parsed);
                }
            }
        }

        res.set(name, value);
    }
}

export function buildRequest(req, params = {}) {
    return {
        url: req.url,
        path: req.path,
        method: req.method,
        headers: req.headers,
        body: buildBody(req),
        query: req.query,
        cookies: req.cookies,
        params,
        ip: req.ip,
        hostname: req.hostname,
        protocol: req.protocol,
    };
}

export function buildBody(req) {
    if(!req.body && !req.files) return null;

    const contentType = req.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
        return { type: 'json', data: new ivm.Reference(req.body) };
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
        return { type: 'urlencoded', data: new ivm.Reference(req.body) };
    }
    if (contentType.includes('multipart/form-data')) {
        return {
            type: 'form-data',
            fields: new ivm.Reference(req.body ?? {}),
            files: Object.fromEntries(
                Object.entries(req.files ?? {}).map(([key, value]) => [
                    key,
                    (Array.isArray(value) ? value : [value]).map(file => ({
                        name: file.name,
                        mimetype: file.mimetype,
                        size: file.size,
                        _ref: new ivm.Reference(file.data),
                        _textRef: new ivm.Reference(() => file.data.toString('utf8')),
                    })),
                ]),
            ),
        };
    }
    if (contentType.includes('text/')) {
        return { type: 'text', data: new ivm.Reference(req.body) };
    }
    if(contentType.includes('application/octet-stream')) {
        return { type: 'raw', data: new ivm.Reference(req.body) };
    }
    return null;
}