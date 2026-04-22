const requireCache = new Map();
const moduleKeys = new Map();
const moduleCheckedAt = new Map();
const moduleCheckIntervalMs = 1000;
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

function isModuleFresh(filePath) {
    if(!requireCache.has(filePath)) return false;
    const now = Date.now();
    const lastChecked = moduleCheckedAt.get(filePath) ?? 0;
    if(now - lastChecked < moduleCheckIntervalMs) {
        return true;
    }
    const currentKey = $getModuleKey.applySyncPromise(undefined, [filePath], {
        arguments: { copy: true },
    });
    moduleCheckedAt.set(filePath, now);
    return moduleKeys.get(filePath) === currentKey;
}

function _require(filePath) {
    const isInternal = filePath in internalModuleCodes;

    if(isInternal) {
        const cachedModule = requireCache.get(filePath);
        if(cachedModule) {
            return cachedModule.exports;
        }
    } else if(isModuleFresh(filePath)) {
        return requireCache.get(filePath).exports;
    }

    const module = { exports: {} };
    requireCache.set(filePath, module);
    const exports = module.exports;

    let code;
    if(isInternal) {
        code = internalModuleCodes[filePath];
    } else {
        const loaded = $getModule.applySyncPromise(undefined, [filePath], {
            arguments: { copy: true },
        });
        code = loaded.code;
        moduleKeys.set(filePath, loaded.moduleKey);
        moduleCheckedAt.set(filePath, Date.now());
    }

    if(filePath.endsWith('.json')) {
        module.exports = JSON.parse(code);
        return module.exports;
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