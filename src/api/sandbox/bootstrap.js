{
    const _path = path;
    const requireCache = new Map();
    const templates = Object.create(null);
    let currentCtx = null;

    function normalizeDebugValue(value, seen = new WeakSet()) {
        if(value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }
        if(typeof value === 'undefined') {
            return '[undefined]';
        }
        if(typeof value === 'bigint') {
            return `${value}n`;
        }
        if(typeof value === 'function') {
            return `[Function ${value.name || 'anonymous'}]`;
        }
        if(typeof value === 'symbol') {
            return String(value);
        }
        if(value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack,
            };
        }
        if(typeof value !== 'object') {
            return String(value);
        }
        if(seen.has(value)) {
            return '[Circular]';
        }
        seen.add(value);
        if(Array.isArray(value)) {
            return value.map((item) => normalizeDebugValue(item, seen));
        }
        const out = {};
        for(const key of Object.keys(value)) {
            out[key] = normalizeDebugValue(value[key], seen);
        }
        return out;
    }

    function injectDebugScript(body, response, debugEnabled, debugLogs) {
        if(!debugEnabled || !debugLogs.length) {
            return body;
        }
        const contentType = response.headers.get('content-type');
        if(contentType != null) {
            const normalized = String(contentType).toLowerCase();
            if(!normalized.startsWith('text/html') && !normalized.startsWith('application/xhtml+xml')) {
                return body;
            }
        }
        const payload = JSON.stringify(debugLogs.map((entry) => ({
            level: entry.level,
            args: entry.args.map((value) => normalizeDebugValue(value)),
        })))
            .replace(/</g, '\\u003c')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
        const script = `<script>(function(){const entries=${payload};for(const entry of entries){const fn=console[entry.level]||console.log;fn(...entry.args);}})();document.currentScript.remove();</script>`;
        const lowerBody = body.toLowerCase();
        const bodyCloseIndex = lowerBody.lastIndexOf('</body>');
        if(bodyCloseIndex === -1) {
            return body + script;
        }
        return body.slice(0, bodyCloseIndex) + script + body.slice(bodyCloseIndex);
    }

    function pushDebugLog(level, args) {
        if(!currentCtx || !currentCtx.debugEnabled) {
            return;
        }
        currentCtx.debugLogs.push({
            level,
            args,
        });
    }

    function createBody(body) {
        if(!body) {
            return body;
        }
        if(body.type === 'form-data') {
            for(const fieldName in body.files) {
                const files = body.files[fieldName];
                for(let i = 0; i < files.length; i++) {
                    const file = files[i];
                    files[i] = {
                        name: file.name,
                        mimetype: file.mimetype,
                        size: file.size,
                        arrayBuffer: () => file._ref.copy(),
                        text: () => file._textRef.apply(undefined, [], {
                            arguments: { copy: true },
                            result: { copy: true },
                        }),
                        json: () => JSON.parse(file._textRef.apply(undefined, [], {
                            arguments: { copy: true },
                            result: { copy: true },
                        })),
                    };
                }
            }
            return {
                text() {
                    throw new Error('Body does not match the expected type (text/*)');
                },
                json() {
                    throw new Error('Body does not match the expected type (application/json)');
                },
                arrayBuffer() {
                    throw new Error('Body does not match the expected type (application/octet-stream)');
                },
                formData() {
                    return {
                        fields: body.fields.copy(),
                        files: body.files,
                    };
                },
            };
        }
        return {
            text() {
                if(body.type !== 'text') throw new Error('Body does not match the expected type (text/*)');
                return body.data.copy();
            },
            json() {
                if(body.type !== 'json') throw new Error('Body does not match the expected type (application/json)');
                return body.data.copy();
            },
            arrayBuffer() {
                if(body.type !== 'raw') throw new Error('Body does not match the expected type (application/octet-stream)');
                return body.data.copy();
            },
            formData() {
                throw new Error('Body does not match the expected type (multipart/form-data)');
            },
        };
    }

    function createContext(req) {
        const ctx = {
            request: {
                url: req?.url,
                path: req?.path,
                method: req?.method,
                headers: new Headers(req?.headers),
                body: createBody(req?.body),
                query: req?.query,
                cookies: req?.cookies,
            },
            response: {
                status: 200,
                statusText: '',
                headers: new Headers(),
                debug(enabled = true) {
                    ctx.debugEnabled = Boolean(enabled);
                }
            },
            out: [],
            debugLogs: [],
            debugEnabled: false,
        };
        return ctx;
    }

    async function ensureTemplate(filePath) {
        if(filePath in templates) {
            return;
        }
        const code = await $getTemplateCode.apply(undefined, [filePath], {
            arguments: { copy: true },
            result: { promise: true, copy: true },
        });
        (0, eval)(code);
        if(!(filePath in templates)) {
            throw new Error('Template not found: ' + filePath);
        }
    }

    function _require(filePath) {
        const cachedModule = requireCache.get(filePath);
        if(cachedModule) {
            return cachedModule.exports;
        }

        const code = $getModule.applySyncPromise(undefined, [filePath], {
            arguments: { copy: true },
        });

        const module = { exports: {} };
        requireCache.set(filePath, module);
        const exports = module.exports;
        const moduleFactory = new Function('module', 'exports', 'require', code);
        moduleFactory(module, exports, function(requiredPath) {
            return _require(_path.resolveRequire(filePath, requiredPath));
        });
        return module.exports;
    }

    Object.defineProperty(globalThis, '__k', {
        value: Object.freeze({
            reg(name, fn) {
                templates[name] = fn;
            },
            async run(req, filePath, locals) {
                await ensureTemplate(filePath);
                const ctx = createContext(req);
                currentCtx = ctx;
                try {
                    await templates[filePath](ctx, filePath, locals || {});
                } finally {
                    currentCtx = null;
                }
                const body = injectDebugScript(ctx.out.join(''), ctx.response, ctx.debugEnabled, ctx.debugLogs);
                return {
                    body,
                    response: {
                        status: ctx.response.status,
                        statusText: ctx.response.statusText,
                        headers: Object.fromEntries(ctx.response.headers.entries()),
                    },
                };
            },
            async include(fromFilePath, includePath, locals, ctx) {
                const filePath = _path.resolveRequire(fromFilePath, includePath);
                await ensureTemplate(filePath);
                const previousCtx = currentCtx;
                currentCtx = ctx;
                try {
                    await templates[filePath](ctx, filePath, locals || {});
                } finally {
                    currentCtx = previousCtx;
                }
            },
            path: _path,
            require: _require,
        }),
        enumerable: false,
        configurable: false,
        writable: false,
    });

    globalThis.Headers = Headers;
    globalThis.fetch = async function fetch(url, options) {
        const data = await $safeFetch.apply(undefined, [url, options || {}], {
            arguments: { copy: true },
            result: { promise: true, copy: true },
        });
        return new Response(data);
    };
    globalThis.require = function require(id) {
        return _require(_path.resolveRequire('/', id));
    };
    globalThis.console = Object.freeze({
        log(...args) {
            pushDebugLog('log', args);
        },
        warn(...args) {
            pushDebugLog('warn', args);
        },
        error(...args) {
            pushDebugLog('error', args);
        },
    });
}
