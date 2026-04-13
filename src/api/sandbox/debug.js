function normalizeDebugValue(value, seen = new WeakSet(), depth = 0) {
    if(depth > 10) {
        return '[...]';
    }
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
        return value.map((item) => normalizeDebugValue(item, seen, depth + 1));
    }
    const out = {};
    for(const key of Object.keys(value)) {
        out[key] = normalizeDebugValue(value[key], seen, depth + 1);
    }
    return out;
}

function injectDebugScript(body, response) {
    if(!response.debugLogs.length) {
        return body;
    }
    const contentType = response.headers.get('content-type');
    if(contentType != null) {
        const normalized = String(contentType).toLowerCase();
        if(!normalized.startsWith('text/html') && !normalized.startsWith('application/xhtml+xml')) {
            return body;
        }
    }
    const payload = JSON.stringify(response.debugLogs.map((entry) => ({
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

function pushDebugLog(response, level, args) {
    if(!response) {
        return;
    }
    response.debugLogs.push({
        level,
        args,
    });
}
