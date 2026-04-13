function decodeFormComponent(value) {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
}

function encodeFormComponent(value) {
    return encodeURIComponent(String(value))
        .replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
        .replace(/%20/g, '+');
}

function parseUrlParts(url, base) {
    const args = base == null ? [String(url)] : [String(url), String(base)];
    return $parseUrl.applySync(undefined, args, {
        arguments: { copy: true },
        result: { copy: true },
    });
}

class URLSearchParams {
    constructor(init) {
        this._entries = [];
        this._url = null;
        if(init == null) {
            return;
        }
        if(init instanceof URLSearchParams) {
            this._entries = init._entries.map(([name, value]) => [name, value]);
            return;
        }
        if(typeof init === 'string') {
            const source = init[0] === '?' ? init.slice(1) : init;
            if(source === '') {
                return;
            }
            for(const pair of source.split('&')) {
                if(pair === '') {
                    continue;
                }
                const eqIndex = pair.indexOf('=');
                const rawName = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
                const rawValue = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);
                this._entries.push([decodeFormComponent(rawName), decodeFormComponent(rawValue)]);
            }
            return;
        }
        if(typeof init[Symbol.iterator] === 'function') {
            for(const pair of init) {
                const entry = Array.from(pair);
                if(entry.length < 2) {
                    throw new TypeError('Expected name/value pair');
                }
                this._entries.push([String(entry[0]), String(entry[1])]);
            }
            return;
        }
        if(typeof init === 'object') {
            for(const [name, value] of Object.entries(init)) {
                this._entries.push([String(name), String(value)]);
            }
        }
    }
    _syncURL() {
        if(this._url) {
            const search = this.toString();
            this._url._search = search ? '?' + search : '';
        }
    }
    append(name, value) {
        this._entries.push([String(name), String(value)]);
        this._syncURL();
    }
    delete(name, value) {
        const normalizedName = String(name);
        if(arguments.length < 2) {
            this._entries = this._entries.filter((entry) => entry[0] !== normalizedName);
        } else {
            const normalizedValue = String(value);
            this._entries = this._entries.filter((entry) => entry[0] !== normalizedName || entry[1] !== normalizedValue);
        }
        this._syncURL();
    }
    get(name) {
        const normalizedName = String(name);
        for(const entry of this._entries) {
            if(entry[0] === normalizedName) {
                return entry[1];
            }
        }
        return null;
    }
    getAll(name) {
        const normalizedName = String(name);
        return this._entries.filter((entry) => entry[0] === normalizedName).map((entry) => entry[1]);
    }
    has(name, value) {
        const normalizedName = String(name);
        if(arguments.length < 2) {
            return this._entries.some((entry) => entry[0] === normalizedName);
        }
        const normalizedValue = String(value);
        return this._entries.some((entry) => entry[0] === normalizedName && entry[1] === normalizedValue);
    }
    set(name, value) {
        const normalizedName = String(name);
        const normalizedValue = String(value);
        let replaced = false;
        const nextEntries = [];
        for(const entry of this._entries) {
            if(entry[0] !== normalizedName) {
                nextEntries.push(entry);
                continue;
            }
            if(!replaced) {
                nextEntries.push([normalizedName, normalizedValue]);
                replaced = true;
            }
        }
        if(!replaced) {
            nextEntries.push([normalizedName, normalizedValue]);
        }
        this._entries = nextEntries;
        this._syncURL();
    }
    sort() {
        this._entries.sort((a, b) => a[0].localeCompare(b[0]));
        this._syncURL();
    }
    forEach(callback, thisArg) {
        for(const entry of this._entries) {
            callback.call(thisArg, entry[1], entry[0], this);
        }
    }
    keys() {
        return this._entries.map((entry) => entry[0])[Symbol.iterator]();
    }
    values() {
        return this._entries.map((entry) => entry[1])[Symbol.iterator]();
    }
    entries() {
        return this._entries.map((entry) => [entry[0], entry[1]])[Symbol.iterator]();
    }
    toString() {
        return this._entries
            .map(([name, value]) => encodeFormComponent(name) + '=' + encodeFormComponent(value))
            .join('&');
    }
    get size() {
        return this._entries.length;
    }
    [Symbol.iterator]() {
        return this.entries();
    }
}

class URL {
    constructor(url, base) {
        this._assign(parseUrlParts(url, base));
    }
    _assign(parts) {
        this._protocol = parts.protocol || '';
        this._username = parts.username || '';
        this._password = parts.password || '';
        this._hostname = parts.hostname || '';
        this._port = parts.port || '';
        this._pathname = parts.pathname || '/';
        this._search = parts.search || '';
        this._hash = parts.hash || '';
        this.searchParams = new URLSearchParams(this._search);
        this.searchParams._url = this;
    }
    static canParse(url, base) {
        try {
            parseUrlParts(url, base);
            return true;
        } catch (error) {
            return false;
        }
    }
    get protocol() {
        return this._protocol;
    }
    set protocol(value) {
        const protocol = String(value);
        this._protocol = protocol.endsWith(':') ? protocol : protocol + ':';
    }
    get username() {
        return this._username;
    }
    set username(value) {
        this._username = String(value);
    }
    get password() {
        return this._password;
    }
    set password(value) {
        this._password = String(value);
    }
    get hostname() {
        return this._hostname;
    }
    set hostname(value) {
        this._hostname = String(value);
    }
    get port() {
        return this._port;
    }
    set port(value) {
        this._port = value == null || value === '' ? '' : String(value);
    }
    get host() {
        return this._port ? this._hostname + ':' + this._port : this._hostname;
    }
    set host(value) {
        const parsed = parseUrlParts(this._protocol + '//' + String(value) + this._pathname + this._search + this._hash);
        this._hostname = parsed.hostname || '';
        this._port = parsed.port || '';
    }
    get origin() {
        if(!this._protocol || !this.host || this._protocol === 'file:') {
            return 'null';
        }
        return this._protocol + '//' + this.host;
    }
    get pathname() {
        return this._pathname;
    }
    set pathname(value) {
        const pathname = String(value || '');
        this._pathname = pathname.startsWith('/') ? pathname : '/' + pathname;
    }
    get search() {
        return this._search;
    }
    set search(value) {
        const search = String(value || '');
        if(search === '' || search === '?') {
            this._search = '';
        } else {
            this._search = search.startsWith('?') ? search : '?' + search;
        }
        this.searchParams = new URLSearchParams(this._search);
        this.searchParams._url = this;
    }
    get hash() {
        return this._hash;
    }
    set hash(value) {
        const hash = String(value || '');
        if(hash === '' || hash === '#') {
            this._hash = '';
        } else {
            this._hash = hash.startsWith('#') ? hash : '#' + hash;
        }
    }
    get href() {
        return this.toString();
    }
    set href(value) {
        this._assign(parseUrlParts(value));
    }
    toString() {
        const auth = this._username
            ? this._username + (this._password ? ':' + this._password : '') + '@'
            : '';
        return this._protocol + '//' + auth + this.host + this._pathname + this._search + this._hash;
    }
    toJSON() {
        return this.href;
    }
}
