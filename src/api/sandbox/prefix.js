const require = function(path) {
    return __k.requireFrom(filePath, path);
};
const include = async function(path, includeLocals) {
    return await __k.include(filePath, path, includeLocals, ctx);
};

locals = locals || {};
const request = ctx.request;
const response = ctx.response;
const isErrorTemplate = filePath === '/_error.cat' || filePath.endsWith('/_error.cat');
if(isErrorTemplate) {
    locals.error = locals.error || { code: 404, message: 'Not found', stack: 'Error: Not found' };
    response.status = Number(locals.error.code) || 500;
}
const __out = ctx.out;
function echo(v) { __out.push(v); }
function escapeHtml(v) { if(v==null)return""; return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
