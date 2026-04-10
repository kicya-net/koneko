import { request, EnvHttpProxyAgent, interceptors } from 'undici';
import { validateUrl } from './utils.js';

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
        class Response {
            constructor(data) {
                this.status = data.status;
                this.statusText = data.statusText;
                this.ok = data.ok;
                this.headers = new Headers(data.headers);
                this._body = data.body; // ArrayBuffer
                this._bodyText = data.bodyText; // String
                this.bodyUsed = false;
            }
            async arrayBuffer() {
                this.bodyUsed = true;
                return this._body;
            }
            async text() {
                this.bodyUsed = true;
                return this._bodyText;
            }
            async json() {
                return JSON.parse(await this.text());
            }
            async blob() {
                throw new Error('blob() is not supported');
            }
        }
    
        class Headers {
            constructor(init) {
                this._h = {};
                for (const [k, v] of Object.entries(init || {})) {
                    this._h[k.toLowerCase()] = v;
                }
            }
            [Symbol.iterator]() { return Object.entries(this._h)[Symbol.iterator](); }
            get(name) { return this._h[name.toLowerCase()] ?? null; }
            has(name) { return name.toLowerCase() in this._h; }
            entries() { return Object.entries(this._h); }
            forEach(cb) { for (const [k, v] of this.entries()) cb(v, k, this); }
        }
    
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