function createBody(body) {
    if(!body) {
        return body;
    }
    if(body.type === 'form-data') {
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
            text() {
                throw new Error('Body does not match the expected type (text/*)');
            },
            json() {
                throw new Error('Body does not match the expected type (application/json)');
            },
            urlencoded() {
                throw new Error('Body does not match the expected type (application/x-www-form-urlencoded)');
            },
            arrayBuffer() {
                throw new Error('Body does not match the expected type (application/octet-stream)');
            },
            formData() {
                return {
                    fields: body.fields.copy(),
                    files: body.files,
                };
            },
        };
    }
    return {
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
        urlencoded() {
            if(body.type !== 'urlencoded') throw new Error('Body does not match the expected type (application/x-www-form-urlencoded)');
            return body.data.copy();
        },
        formData() {
            throw new Error('Body does not match the expected type (multipart/form-data)');
        },
    };
}

function createContext(req) {
    const response = {
        status: 200,
        statusText: '',
        headers: new Headers(),
        debugLogs: [],
    };
    return {
        request: {
            url: req?.url,
            path: req?.path,
            method: req?.method,
            headers: new Headers(req?.headers),
            body: createBody(req?.body),
            query: req?.query,
            cookies: req?.cookies,
        },
        response,
        out: [],
    };
}
