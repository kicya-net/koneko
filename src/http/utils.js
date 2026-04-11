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


export function generateError(status, message) {
    return `<!DOCTYPE html><html><body><h1>Error ${status}</h1><p>${message}</p><hr><i>Koneko</i></body></html>`;
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

export function buildRequest(req) {
    return {
        url: req.url,
        path: req.path,
        method: req.method,
        headers: req.headers,
        body: buildBody(req),
        query: req.query,
        cookies: req.cookies,
    };
}

export function buildBody(req) {
    if(!req.body && !req.files) return null;

    const contentType = req.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
        return { type: 'json', data: req.body };
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
        return { type: 'urlencoded', data: req.body };
    }
    if (contentType.includes('multipart/form-data')) {
        return {
            type: 'form-data',
            body: req.body ?? {},
            fields: req.body,
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
        return { type: 'text', data: req.body };
    }
    if(contentType.includes('application/octet-stream')) {
        return { type: 'raw', data: req.body };
    }
    return null;
}