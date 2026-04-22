const requireCache = new Map();
const internalModuleCodes = Object.freeze(
    $internalModuleCodes.applySync(undefined, [], {
        result: { copy: true },
    }),
);

const _internals = Object.freeze({
    cryptoInvoke(op, ...args) {
        return $cryptoBridge.applySync(undefined, [op, ...args], {
            arguments: { copy: true },
            result: { copy: true },
        });
    },
    fsInvoke(op, ...args) {
        return $fsBridge.apply(undefined, [op, ...args], {
            arguments: { copy: true },
            result: { promise: true, copy: true },
        });
    },
    sqliteInvoke(op, ...args) {
        return $sqliteBridge.apply(undefined, [op, ...args], {
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
    if(filePath.endsWith('.json')) {
        module.exports = JSON.parse(code);
        return module.exports
    }
    const moduleFactory = new Function('module', 'exports', 'require', `${code}\n//# sourceURL=${filePath}`);
    const childRequire = function(requiredPath) {
        if(requiredPath === '__internals') {
            return _internals;
        }
        return _require(resolveRequire(filePath, requiredPath));
    };
    moduleFactory(module, exports, childRequire);
    return module.exports;
}