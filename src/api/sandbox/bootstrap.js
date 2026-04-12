{
    const _path = path;
    const requireCache = new Map();
    const templates = Object.create(null);

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
            run(req, filePath) {
                if(!(filePath in templates)) {
                    throw new Error('Template not found: ' + filePath);
                }
                return templates[filePath](req, filePath);
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
