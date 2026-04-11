let request;
{
    const __kWrapFormFile = (file) => {
        if(!file || typeof file !== 'object' || !file._ref) return file;
        return {
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

    const __kWrapFormFiles = (files) => {
        return Object.fromEntries(
            Object.entries(files ?? {}).map(([key, value]) => [
                key,
                (Array.isArray(value) ? value : [value]).map(__kWrapFormFile),
            ]),
        );
    }

    const __kWrapRequestBody = (body) => {
        if(!body || typeof body !== 'object') return body;
        if(body.type !== 'form-data') return body;
        return {
            ...body,
            files: __kWrapFormFiles(body.files),
        };
    }

    request = { 
        url: __request.url,
        path: __request.path,
        method: __request.method,
        headers: new Headers(__request.headers),
        body: __kWrapRequestBody(__request.body),
        query: __request.query,
        cookies: __request.cookies,
    };
}
const __k = [];
const response = { status: 200, statusText: '', headers: new Headers() };
function echo(v) { __k.push(v); }
function escapeHtml(v) { if(v==null)return""; return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
__request = undefined;