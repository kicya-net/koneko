class Headers {
    constructor(init) {
        this._h = {};
        if (init == null) return;
        if (typeof init === 'string') return;
        if (Array.isArray(init) || (typeof init[Symbol.iterator] === 'function')) {
            for (const pair of init) {
                if (pair == null || typeof pair[Symbol.iterator] !== 'function') continue;
                const a = Array.from(pair);
                if (a.length >= 2 && a[0] != null) this.append(a[0], a[1]);
            }
        } else if (typeof init === 'object') {
            for (const [k, v] of Object.entries(init)) {
                if (v != null) this.append(k, v);
            }
        }
    }
    get(name) {
        const v = this._h[String(name).toLowerCase()];
        return v === undefined ? null : v;
    }
    set(name, value) {
        this._h[String(name).toLowerCase()] = String(value);
    }
    append(name, value) {
        const k = String(name).toLowerCase();
        const s = String(value);
        this._h[k] = k in this._h ? this._h[k] + ', ' + s : s;
    }
    delete(name) {
        delete this._h[String(name).toLowerCase()];
    }
    has(name) {
        return String(name).toLowerCase() in this._h;
    }
    entries() {
        return Object.entries(this._h);
    }
    [Symbol.iterator]() {
        return this.entries()[Symbol.iterator]();
    }
    forEach(fn, thisArg) {
        for (const [k, v] of this.entries()) fn.call(thisArg, v, k, this);
    }
}