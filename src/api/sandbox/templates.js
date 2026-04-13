const templates = Object.create(null);

async function ensureTemplate(filePath) {
    if(filePath in templates) {
        return;
    }
    const code = await $getTemplateCode.apply(undefined, [filePath], {
        arguments: { copy: true },
        result: { promise: true, copy: true },
    });
    (0, eval)(code);
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
}

async function _includeTemplate(fromFilePath, includePath, locals, ctx) {
    const filePath = _require('path').resolveRequire(fromFilePath, includePath);
    await ensureTemplate(filePath);
    await withResponse(ctx.response, async function() {
        await templates[filePath](ctx, filePath, locals || {});
    });
}
