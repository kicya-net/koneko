const { cryptoInvoke } = require('__internals');

const crypto = {
    sha256(data) {
        return cryptoInvoke('digest', 'sha256', String(data));
    },
    sha512(data) {
        return cryptoInvoke('digest', 'sha512', String(data));
    },
    sha1(data) {
        return cryptoInvoke('digest', 'sha1', String(data));
    },
    md5(data) {
        return cryptoInvoke('digest', 'md5', String(data));
    },
    hmacSha256(key, data) {
        return cryptoInvoke('hmac', 'sha256', String(key), String(data));
    },
    hmacSha512(key, data) {
        return cryptoInvoke('hmac', 'sha512', String(key), String(data));
    },
    randomBytes(size) {
        const n = Number(size);
        const hex = cryptoInvoke('randomHex', n);
        const out = new Uint8Array(n);
        for(let i = 0; i < n; i++) {
            out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
    },
    randomUUID() {
        return cryptoInvoke('randomUuid');
    },
    timingSafeEqual(a, b) {
        return cryptoInvoke('timingSafeEqual', String(a), String(b));
    },
};

module.exports = Object.freeze(crypto);
