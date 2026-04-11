import { request, EnvHttpProxyAgent, interceptors } from 'undici';
import fs from 'fs/promises';
import { validateUrl } from './utils.js';

const SANDBOX_HEADERS_CLASS = await fs.readFile(new URL('./sandbox/headers.js', import.meta.url), 'utf-8');
const SANDBOX_RESPONSE_CLASS = await fs.readFile(new URL('./sandbox/response.js', import.meta.url), 'utf-8');

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

const safeFetchDispatcher = new EnvHttpProxyAgent().compose(
    interceptors.redirect({ maxRedirections: 20 }),
);

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
    const validatedUrl = await validateUrl(urlString);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000); // 4s timeout

    try {
        const req = {
            method: options.method || 'GET',
            headers: options.headers || {},
            signal: controller.signal,
            headersTimeout: 4_000,
            maxRedirections: 20,
            dispatcher: safeFetchDispatcher,
        };
        if (options.body != null) req.body = options.body;

        const { statusCode, statusText, headers, body } = await request(validatedUrl, req);

        const cl = headers['content-length'];
        if (cl != null) {
            const raw = Array.isArray(cl) ? cl[0] : cl;
            const n = Number(raw);
            if (Number.isFinite(n) && n > MAX_RESPONSE_BYTES) {
                await body.dump({ limit: 0 });
                throw new Error('Response too large (max 20MB)');
            }
        }

        const arrayBuffer = await readBodyWithLimit(body, MAX_RESPONSE_BYTES);

        return {
            status: statusCode,
            statusText,
            headers: incomingHeadersToObject(headers),
            body: arrayBuffer,
            bodyText: new TextDecoder().decode(arrayBuffer),
            ok: statusCode >= 200 && statusCode < 300,
        };
    } finally {
        clearTimeout(timeout);
    }
}

export default async function buildNetApi(siteWorker) {
    await siteWorker.context.evalClosure(`
        ${SANDBOX_HEADERS_CLASS}
        ${SANDBOX_RESPONSE_CLASS}
        globalThis.Headers = Headers;
    
        globalThis.fetch = async function(url, options) {
            const data = await $0.apply(undefined, [url, options || {}], {
                arguments: { copy: true },
                result: { promise: true, copy: true }
            });
            return new Response(data);
        };
    `, [
        async (url, options) => safeFetch(url, options),
    ], { arguments: { reference: true } });
}