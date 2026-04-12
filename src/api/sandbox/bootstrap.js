{
    const _path = path;
    const requireCache = new Map();
    const templates = Object.create(null);

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
        return {
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
            },
            out: [],
        };
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
                await templates[filePath](ctx, filePath, locals || {});
                return {
                    body: ctx.out.join(''),
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
                await templates[filePath](ctx, filePath, locals || {});
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
}
