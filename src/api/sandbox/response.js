class Response {
    constructor(data) {
        this.status = data.status;
        this.statusText = data.statusText;
        this.ok = data.ok;
        this.headers = new Headers(data.headers);
        this._body = data.body; // ArrayBuffer
        this._bodyText = data.bodyText; // String
        this.bodyUsed = false;
    }
    async arrayBuffer() {
        this.bodyUsed = true;
        return this._body;
    }
    async text() {
        this.bodyUsed = true;
        return this._bodyText;
    }
    async json() {
        return JSON.parse(await this.text());
    }
    async blob() {
        throw new Error('blob() is not supported');
    }
}