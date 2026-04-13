Object.defineProperty(globalThis, '__k', {
    value: Object.freeze({
        reg: _regTemplate,
        run: _runTemplate,
        include: _includeTemplate,
        requireFrom(fromFilePath, requiredPath) {
            return _require(resolveRequire(fromFilePath, requiredPath));
        },
        require: _require,
    }),
    enumerable: false,
    configurable: false,
    writable: false,
});

globalThis.Headers = Headers;
globalThis.atob = atob;
globalThis.btoa = btoa;
globalThis.fetch = async function fetch(url, options) {
    const data = await $safeFetch.apply(undefined, [url, options || {}], {
        arguments: { copy: true },
        result: { promise: true, copy: true },
    });
    return new Response(data);
};
globalThis.require = function require(id) {
    return _require(resolveRequire('/', id));
};
globalThis.console = Object.freeze({
    log(...args) {
        pushDebugLog(getCurrentResponse(), 'log', args);
    },
    warn(...args) {
        pushDebugLog(getCurrentResponse(), 'warn', args);
    },
    error(...args) {
        pushDebugLog(getCurrentResponse(), 'error', args);
    },
});
