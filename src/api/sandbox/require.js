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
        path = String(path);
        const isAbsolute = path.startsWith('/');
        const parts = (isAbsolute ? path : `${filePath.slice(0, filePath.lastIndexOf('/') + 1)}${path}`).split('/');
        const resolvedParts = [];
        for(const part of parts) {
            if(!part || part === '.') continue;
            if(part === '..') {
                if(resolvedParts.length) resolvedParts.pop();
                continue;
            }
            resolvedParts.push(part);
        }
        return globalThis._require('/' + resolvedParts.join('/'));
    });
    return module.exports;
}