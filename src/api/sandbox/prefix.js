const request = { 
    url: __request.url,
    method: __request.method,
    headers: new Headers(__request.headers),
    body: __request.body,
    query: __request.query,
    cookies: __request.cookies,
};
const __k = [];
const response = { status: 200, statusText: '', headers: new Headers() };
function echo(v) { __k.push(v); }
function escapeHtml(v) { if(v==null)return""; return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

