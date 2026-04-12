const __requireCache = new Map();

globalThis._require = function(filePath) {
    const cachedModule = __requireCache.get(filePath);
    if(cachedModule) {
        return cachedModule.exports;
    }

    const code = $0.applySyncPromise(undefined, [filePath], {
        arguments: { copy: true },
    });

    const module = { exports: {} };
    __requireCache.set(filePath, module);
    const exports = module.exports;
    const moduleFactory = new Function('module', 'exports', 'require', code);
    moduleFactory(module, exports, function(path) {
        return globalThis._require(globalThis.path.resolveRequire(filePath, path));
    });
    return module.exports;
}