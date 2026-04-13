const timeoutRecords = new Map();
let nextTimeoutId = 1;

function normalizeDelay(delay) {
    const ms = Number(delay);
    if(!Number.isFinite(ms) || ms <= 0) {
        return 0;
    }
    return Math.min(Math.floor(ms), 2 ** 31 - 1);
}

function unlinkTimeout(id, response) {
    if(response && response._timeouts) {
        response._timeouts.delete(id);
    }
}

function clearPendingResponseTimeouts(response) {
    if(!response || !response._timeouts || response._timeouts.size === 0) {
        return;
    }
    const ids = Array.from(response._timeouts);
    response._timeouts.clear();
    for(const id of ids) {
        globalThis.clearTimeout(id);
    }
}

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
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;
globalThis.atob = atob;
globalThis.btoa = btoa;
globalThis.setTimeout = function setTimeout(callback, delay) {
    if(typeof callback !== 'function') {
        throw new TypeError('setTimeout callback must be a function');
    }
    const args = Array.prototype.slice.call(arguments, 2);
    const id = nextTimeoutId++;
    const response = getCurrentResponse();
    timeoutRecords.set(id, response);
    if(response && response._timeouts) {
        response._timeouts.add(id);
    }
    $sleep.apply(undefined, [normalizeDelay(delay)], {
        arguments: { copy: true },
        result: { promise: true, copy: true },
    }).then(() => {
        const currentResponse = timeoutRecords.get(id);
        if(currentResponse === undefined && !timeoutRecords.has(id)) {
            return;
        }
        timeoutRecords.delete(id);
        unlinkTimeout(id, currentResponse);
        callback.apply(undefined, args);
    }, () => {
        const currentResponse = timeoutRecords.get(id);
        timeoutRecords.delete(id);
        unlinkTimeout(id, currentResponse);
    });
    return id;
};
globalThis.clearTimeout = function clearTimeout(id) {
    const key = Number(id);
    if(!timeoutRecords.has(key)) {
        return;
    }
    const response = timeoutRecords.get(key);
    timeoutRecords.delete(key);
    unlinkTimeout(key, response);
};
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
