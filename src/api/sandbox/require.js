const requireCache = new Map();
const internalModuleCodes = Object.freeze(
    $internalModuleCodes.applySync(undefined, [], {
        result: { copy: true },
    }),
);

const _internals = Object.freeze({
    cryptoInvoke(op) {
        const args = Array.prototype.slice.call(arguments, 1);
        return $cryptoBridge.applySync(undefined, [op].concat(args), {
            arguments: { copy: true },
            result: { copy: true },
        });
    },
    fsInvoke(op) {
        const args = Array.prototype.slice.call(arguments, 1);
        return $fsBridge.apply(undefined, [op].concat(args), {
            arguments: { copy: true },
            result: { promise: true, copy: true },
        });
    },
});

function resolveRequire(fromFilePath, requiredPath) {
    if(requiredPath in internalModuleCodes) {
        return requiredPath;
    }
    return _require('path').resolveRequire(fromFilePath, requiredPath);
}

function _require(filePath) {
    const cachedModule = requireCache.get(filePath);
    if(cachedModule) {
        return cachedModule.exports;
    }

    const module = { exports: {} };
    requireCache.set(filePath, module);
    const exports = module.exports;
    const isInternal = filePath in internalModuleCodes;
    const code = isInternal
        ? internalModuleCodes[filePath]
        : $getModule.applySyncPromise(undefined, [filePath], {
            arguments: { copy: true },
        });
    const moduleFactory = new Function('module', 'exports', 'require', code);
    const childRequire = function(requiredPath) {
        if(requiredPath === '__internals') {
            return _internals;
        }
        return _require(resolveRequire(filePath, requiredPath));
    };
    moduleFactory(module, exports, childRequire);
    return module.exports;
}
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