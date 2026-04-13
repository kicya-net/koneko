import nodeCrypto from 'node:crypto';

const HASH_ALGOS = new Set(['sha256', 'sha512', 'sha1', 'md5']);

export function cryptoBridge(op, ...args) {
    switch(op) {
        case 'digest': {
            const [algorithm, data] = args;
            const a = String(algorithm);
            if(!HASH_ALGOS.has(a)) {
                throw new Error('Unsupported hash algorithm');
            }
            return nodeCrypto.createHash(a).update(String(data), 'utf8').digest('hex');
        }
        case 'hmac': {
            const [algorithm, key, data] = args;
            const a = String(algorithm);
            if(!HASH_ALGOS.has(a)) {
                throw new Error('Unsupported hash algorithm');
            }
            return nodeCrypto.createHmac(a, String(key)).update(String(data), 'utf8').digest('hex');
        }
        case 'randomHex': {
            const [n] = args;
            const size = Number(n);
            if(!Number.isFinite(size) || size !== (size | 0) || size < 1 || size > 4096) {
                throw new Error('randomBytes size must be an integer from 1 to 4096');
            }
            return nodeCrypto.randomBytes(size).toString('hex');
        }
        case 'randomUuid':
            return nodeCrypto.randomUUID();
        case 'timingSafeEqual': {
            const [a, b] = args;
            const s = String(a);
            const t = String(b);
            if(s.length !== t.length) {
                return false;
            }
            return nodeCrypto.timingSafeEqual(Buffer.from(s, 'utf8'), Buffer.from(t, 'utf8'));
        }
        default:
            throw new Error('Unknown crypto operation');
    }
}
