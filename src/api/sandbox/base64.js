const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function btoa(input) {
    input = String(input);
    let out = '';
    for(let i = 0; i < input.length; i += 3) {
        const a = input.charCodeAt(i);
        const b = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
        const c = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN;
        if(a > 255 || b > 255 || c > 255) {
            throw new Error('Invalid character');
        }
        const chunk = (a << 16) | ((b || 0) << 8) | (c || 0);
        out += base64Alphabet[(chunk >> 18) & 63];
        out += base64Alphabet[(chunk >> 12) & 63];
        out += Number.isNaN(b) ? '=' : base64Alphabet[(chunk >> 6) & 63];
        out += Number.isNaN(c) ? '=' : base64Alphabet[chunk & 63];
    }
    return out;
}

function atob(input) {
    input = String(input).replace(/[\t\n\f\r ]+/g, '');
    if(input.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(input)) {
        throw new Error('Invalid character');
    }
    let out = '';
    for(let i = 0; i < input.length; i += 4) {
        const a = input[i];
        const b = input[i + 1];
        const c = input[i + 2];
        const d = input[i + 3];
        const chunk =
            (base64Alphabet.indexOf(a) << 18) |
            (base64Alphabet.indexOf(b) << 12) |
            ((c === '=' ? 0 : base64Alphabet.indexOf(c)) << 6) |
            (d === '=' ? 0 : base64Alphabet.indexOf(d));
        out += String.fromCharCode((chunk >> 16) & 255);
        if(c !== '=') out += String.fromCharCode((chunk >> 8) & 255);
        if(d !== '=') out += String.fromCharCode(chunk & 255);
    }
    return out;
}