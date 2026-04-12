if(__request?.body?.type === 'form-data' && __request?.body?.files) {
    for(const fieldName in __request.body.files) {
        const files = __request.body.files[fieldName];
        for(let i = 0; i < files.length; i++) {
            const file = files[i];
            files[i] = {
                name: file.name,
                mimetype: file.mimetype,
                size: file.size,
                read: () => file._ref.copySync(),
                text: () => file._textRef.applySync(undefined, [], {
                    arguments: { copy: true },
                    result: { copy: true },
                }),
                json: () => JSON.parse(file._textRef.applySync(undefined, [], {
                    arguments: { copy: true },
                    result: { copy: true },
                })),
            };
        }
    }
}

const request = { 
    url: __request.url,
    path: __request.path,
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
__request = undefined;