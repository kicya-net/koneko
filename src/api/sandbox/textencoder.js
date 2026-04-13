function normalizeDecoderEncoding(label) {
    switch ((label == null ? 'utf-8' : String(label)).trim().toLowerCase()) {
        case 'utf-8':
        case 'utf8':
            return 'utf-8';
        case 'utf-16le':
        case 'utf16le':
        case 'utf-16':
        case 'utf16':
            return 'utf-16le';
        case 'utf-16be':
        case 'utf16be':
            return 'utf-16be';
        case 'latin1':
        case 'iso-8859-1':
        case 'iso8859-1':
            return 'latin1';
        case 'ascii':
        case 'us-ascii':
            return 'ascii';
        default:
            throw new RangeError('Unsupported encoding: ' + label);
    }
}

function toBytes(input) {
    if(input == null) {
        return new Uint8Array(0);
    }
    if(input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    if(ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    throw new TypeError('Expected ArrayBuffer or an ArrayBuffer view');
}

function appendCodePoint(parts, codePoint) {
    if(codePoint <= 0xFFFF) {
        parts.push(String.fromCharCode(codePoint));
        return;
    }
    codePoint -= 0x10000;
    parts.push(String.fromCharCode(
        0xD800 + (codePoint >> 10),
        0xDC00 + (codePoint & 0x3FF),
    ));
}

function decodeUtf8(bytes, fatal) {
    const parts = [];
    for(let i = 0; i < bytes.length; i++) {
        const first = bytes[i];
        if(first < 0x80) {
            parts.push(String.fromCharCode(first));
            continue;
        }

        let needed = 0;
        let codePoint = 0;
        let min = 0;
        if(first >= 0xC2 && first <= 0xDF) {
            needed = 1;
            codePoint = first & 0x1F;
            min = 0x80;
        } else if(first >= 0xE0 && first <= 0xEF) {
            needed = 2;
            codePoint = first & 0x0F;
            min = 0x800;
        } else if(first >= 0xF0 && first <= 0xF4) {
            needed = 3;
            codePoint = first & 0x07;
            min = 0x10000;
        } else {
            if(fatal) {
                throw new TypeError('Invalid UTF-8 data');
            }
            parts.push('\uFFFD');
            continue;
        }

        if(i + needed >= bytes.length) {
            if(fatal) {
                throw new TypeError('Invalid UTF-8 data');
            }
            parts.push('\uFFFD');
            break;
        }

        let valid = true;
        for(let j = 1; j <= needed; j++) {
            const next = bytes[i + j];
            if((next & 0xC0) !== 0x80) {
                valid = false;
                break;
            }
            codePoint = (codePoint << 6) | (next & 0x3F);
        }

        if(!valid || codePoint < min || codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
            if(fatal) {
                throw new TypeError('Invalid UTF-8 data');
            }
            parts.push('\uFFFD');
            continue;
        }

        i += needed;
        appendCodePoint(parts, codePoint);
    }
    return parts.join('');
}

function decodeUtf16(bytes, littleEndian) {
    const parts = [];
    for(let i = 0; i + 1 < bytes.length; i += 2) {
        const codeUnit = littleEndian
            ? bytes[i] | (bytes[i + 1] << 8)
            : (bytes[i] << 8) | bytes[i + 1];
        parts.push(String.fromCharCode(codeUnit));
    }
    if(bytes.length % 2 === 1) {
        parts.push('\uFFFD');
    }
    return parts.join('');
}

function encodeUtf8(input) {
    const bytes = [];
    for(let i = 0; i < input.length; i++) {
        let codePoint = input.charCodeAt(i);
        if(codePoint >= 0xD800 && codePoint <= 0xDBFF) {
            const next = input.charCodeAt(i + 1);
            if(next >= 0xDC00 && next <= 0xDFFF) {
                codePoint = 0x10000 + ((codePoint - 0xD800) << 10) + (next - 0xDC00);
                i++;
            } else {
                codePoint = 0xFFFD;
            }
        } else if(codePoint >= 0xDC00 && codePoint <= 0xDFFF) {
            codePoint = 0xFFFD;
        }

        if(codePoint < 0x80) {
            bytes.push(codePoint);
        } else if(codePoint < 0x800) {
            bytes.push(
                0xC0 | (codePoint >> 6),
                0x80 | (codePoint & 0x3F),
            );
        } else if(codePoint < 0x10000) {
            bytes.push(
                0xE0 | (codePoint >> 12),
                0x80 | ((codePoint >> 6) & 0x3F),
                0x80 | (codePoint & 0x3F),
            );
        } else {
            bytes.push(
                0xF0 | (codePoint >> 18),
                0x80 | ((codePoint >> 12) & 0x3F),
                0x80 | ((codePoint >> 6) & 0x3F),
                0x80 | (codePoint & 0x3F),
            );
        }
    }
    return new Uint8Array(bytes);
}

class TextEncoder {
    constructor() {
        this.encoding = 'utf-8';
    }
    encode(input = '') {
        return encodeUtf8(String(input));
    }
    encodeInto(input = '', destination) {
        if(!(destination instanceof Uint8Array)) {
            throw new TypeError('encodeInto destination must be a Uint8Array');
        }
        const encoded = this.encode(input);
        const written = Math.min(encoded.length, destination.length);
        destination.set(encoded.subarray(0, written));
        return {
            read: String(input).length,
            written,
        };
    }
}

class TextDecoder {
    constructor(label = 'utf-8', options) {
        options = options || {};
        this.encoding = normalizeDecoderEncoding(label);
        this.fatal = Boolean(options.fatal);
        this.ignoreBOM = Boolean(options.ignoreBOM);
    }
    decode(input) {
        const bytes = toBytes(input);
        let text = '';
        if(this.encoding === 'utf-8') {
            text = decodeUtf8(bytes, this.fatal);
        } else if(this.encoding === 'utf-16le') {
            text = decodeUtf16(bytes, true);
        } else if(this.encoding === 'utf-16be') {
            text = decodeUtf16(bytes, false);
        } else if(this.encoding === 'latin1') {
            text = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
        } else {
            text = Array.from(bytes, (byte) => String.fromCharCode(byte & 0x7F)).join('');
        }
        if(!this.ignoreBOM && text.charCodeAt(0) === 0xFEFF) {
            return text.slice(1);
        }
        return text;
    }
}
