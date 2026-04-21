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

import { request, EnvHttpProxyAgent } from 'undici';
import { validateUrl } from './utils.js';

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

const safeFetchDispatcher = new EnvHttpProxyAgent();
const MAX_REDIRECTIONS = 20;

function incomingHeadersToObject(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        if (v == null) continue;
        out[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    return out;
}

async function readBodyWithLimit(body, maxBytes) {
    const chunks = [];
    let total = 0;
    try {
        for await (const chunk of body) {
            const next = total + chunk.length;
            if (next > maxBytes) {
                await body.dump({ limit: 0 });
                throw new Error('Response too large (max 20MB)');
            }
            total = next;
            chunks.push(chunk);
        }
    } catch (e) {
        if (e?.message === 'Response too large (max 20MB)') throw e;
        if (!body.destroyed) {
            await body.dump({ limit: 0 }).catch(() => {});
        }
        throw e;
    }

    const buf = Buffer.concat(chunks);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export async function safeFetch(urlString, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000); // 4s timeout

    try {
        let currentUrl = String(urlString);
        let method = options.method || 'GET';
        let body = options.body;
        const baseHeaders = options.headers || {};

        for (let redirects = 0; redirects <= MAX_REDIRECTIONS; redirects += 1) {
            const validated = await validateUrl(currentUrl);
            const targetUrl = new URL(validated.url);
            targetUrl.hostname = validated.resolvedAddress;
            const headers = {
                ...baseHeaders,
                host: validated.hostHeader,
            };
            const req = {
                method,
                headers,
                signal: controller.signal,
                headersTimeout: 4_000,
                maxRedirections: 0,
                dispatcher: safeFetchDispatcher,
            };
            if (targetUrl.protocol === 'https:' && validated.host !== validated.resolvedAddress) {
                req.servername = validated.host;
            }
            if (body != null) {
                req.body = body;
            }
            const { statusCode, statusText, headers: responseHeaders, body: responseBody } = await request(targetUrl, req);

            if (statusCode >= 300 && statusCode < 400 && responseHeaders.location != null) {
                await responseBody.dump({ limit: 0 });
                if (redirects === MAX_REDIRECTIONS) {
                    throw new Error('Too many redirects');
                }
                const location = Array.isArray(responseHeaders.location) ? responseHeaders.location[0] : responseHeaders.location;
                if (!location) {
                    throw new Error('Invalid redirect location');
                }
                currentUrl = new URL(location, validated.url).toString();
                if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && method.toUpperCase() === 'POST')) {
                    method = 'GET';
                    body = undefined;
                }
                continue;
            }

            const cl = responseHeaders['content-length'];
            if (cl != null) {
                const raw = Array.isArray(cl) ? cl[0] : cl;
                const n = Number(raw);
                if (Number.isFinite(n) && n > MAX_RESPONSE_BYTES) {
                    await responseBody.dump({ limit: 0 });
                    throw new Error('Response too large (max 20MB)');
                }
            }

            const arrayBuffer = await readBodyWithLimit(responseBody, MAX_RESPONSE_BYTES);

            return {
                status: statusCode,
                statusText,
                headers: incomingHeadersToObject(responseHeaders),
                body: arrayBuffer,
                bodyText: new TextDecoder().decode(arrayBuffer),
                ok: statusCode >= 200 && statusCode < 300,
            };
        }
        throw new Error('Too many redirects');
    } finally {
        clearTimeout(timeout);
    }
}