if(req?.body) {
    const body = req.body;
    req.body = {
        text() {
            if(body.type !== 'text') throw new Error('Body does not match the expected type (text/*)');
            return body.data.copy();
        },
        json() {
            if(body.type !== 'json') throw new Error('Body does not match the expected type (application/json)');
            return body.data.copy();
        },
        arrayBuffer() {
            if(body.type !== 'raw') throw new Error('Body does not match the expected type (application/octet-stream)');
            return body.data.copy();
        },
        formData() {
            if(body.type !== 'form-data') throw new Error('Body does not match the expected type (multipart/form-data)');
            for(const fieldName in body.files) {
                const files = body.files[fieldName];
                for(let i = 0; i < files.length; i++) {
                    const file = files[i];
                    files[i] = {
                        name: file.name,
                        mimetype: file.mimetype,
                        size: file.size,
                        arrayBuffer: () => file._ref.copy(),
                        text: () => file._textRef.apply(undefined, [], {
                            arguments: { copy: true },
                            result: { copy: true },
                        }),
                        json: () => JSON.parse(file._textRef.apply(undefined, [], {
                            arguments: { copy: true },
                            result: { copy: true },
                        })),
                    };
                }
            }
            return {
                fields: body.fields.copy(),
                files: body.files
            }
        },
    }
}

{
    const _require = globalThis._require;
    globalThis.require = function(path) {
        return _require(globalThis.path.resolveRequire(filePath, path));
    };
}

const request = { 
    url: req.url,
    path: req.path,
    method: req.method,
    headers: new Headers(req.headers),
    body: req.body,
    query: req.query,
    cookies: req.cookies,
};
const __k = [];
const response = { status: 200, statusText: '', headers: new Headers() };
function echo(v) { __k.push(v); }
function escapeHtml(v) { if(v==null)return""; return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
req = undefined;
