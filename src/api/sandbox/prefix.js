const require = function(path) {
    return __k.require(__k.path.resolveRequire(filePath, path));
};
const include = async function(path, includeLocals) {
    return await __k.include(filePath, path, includeLocals, ctx);
};

locals = locals || {};
const request = ctx.request;
const response = ctx.response;
const __out = ctx.out;
function echo(v) { __out.push(v); }
function escapeHtml(v) { if(v==null)return""; return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
