function bridge(op) {
    const args = Array.prototype.slice.call(arguments, 1);
    return internals.cryptoInvoke.apply(internals, [op].concat(args));
}

const crypto = {
    sha256(data) {
        return bridge('digest', 'sha256', String(data));
    },
    sha512(data) {
        return bridge('digest', 'sha512', String(data));
    },
    sha1(data) {
        return bridge('digest', 'sha1', String(data));
    },
    md5(data) {
        return bridge('digest', 'md5', String(data));
    },
    hmacSha256(key, data) {
        return bridge('hmac', 'sha256', String(key), String(data));
    },
    hmacSha512(key, data) {
        return bridge('hmac', 'sha512', String(key), String(data));
    },
    randomBytes(size) {
        const n = Number(size);
        const hex = bridge('randomHex', n);
        const out = new Uint8Array(n);
        for(let i = 0; i < n; i++) {
            out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
    },
    randomUUID() {
        return bridge('randomUuid');
    },
    timingSafeEqual(a, b) {
        return bridge('timingSafeEqual', String(a), String(b));
    },
};

module.exports = Object.freeze(crypto);
