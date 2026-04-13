const templates = Object.create(null);
const templateKeys = Object.create(null);
const templateCheckedAt = Object.create(null);
const templateCheckIntervalMs = 500;
const _eval = globalThis.eval;

async function ensureTemplate(filePath) {
    if(filePath === '__template' && filePath in templates) {
        return;
    }
    let templateKey = null;
    if(filePath in templates) {
        const now = Date.now();
        if(now - (templateCheckedAt[filePath] ?? 0) < templateCheckIntervalMs) {
            return;
        }
        templateCheckedAt[filePath] = now;
        templateKey = await $getTemplateKey.apply(undefined, [filePath], {
            arguments: { copy: true },
            result: { promise: true, copy: true },
        });
        if(templateKeys[filePath] === templateKey) {
            return;
        }
    }
    const loaded = await $getTemplateCode.apply(undefined, [filePath], {
        arguments: { copy: true },
        result: { promise: true, copy: true },
    });
    const code = loaded.code;
    templateKey = loaded.templateKey;
    _eval(code);
    templateKeys[filePath] = templateKey;
    templateCheckedAt[filePath] = Date.now();
    if(!(filePath in templates)) {
        throw new Error('Template not found: ' + filePath);
    }
}

function _regTemplate(name, fn) {
    templates[name] = fn;
}

async function _runTemplate(req, filePath, locals) {
    await ensureTemplate(filePath);
    const ctx = createContext(req);
    try {
        await withResponse(ctx.response, async function() {
            await templates[filePath](ctx, filePath, locals || {});
        });
        const body = injectDebugScript(ctx.out.join(''), ctx.response);
        return {
            body,
            response: {
                status: ctx.response.status,
                statusText: ctx.response.statusText,
                headers: Object.fromEntries(ctx.response.headers.entries()),
            },
        };
    } finally {
        clearPendingResponseTimeouts(ctx.response);
    }
}

async function _includeTemplate(fromFilePath, includePath, locals, ctx) {
    const filePath = _require('path').resolveRequire(fromFilePath, includePath);
    await ensureTemplate(filePath);
    await withResponse(ctx.response, async function() {
        await templates[filePath](ctx, filePath, locals || {});
    });
}
