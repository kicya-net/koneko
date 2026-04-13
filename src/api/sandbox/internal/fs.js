const { fsInvoke } = require('__internals');

const fs = {
    async readFile(filePath, encoding) {
        const p = String(filePath);
        const enc = encoding == null || encoding === undefined
            ? null
            : String(encoding).toLowerCase();
        if(enc === 'utf8' || enc === 'utf-8') {
            return await fsInvoke('readFile', p, 'utf8');
        }
        const bytes = await fsInvoke('readFile', p, 'buffer');
        return new Uint8Array(bytes).buffer;
    },
    readdir(dirPath) {
        return fsInvoke('readdir', String(dirPath));
    },
    stat(filePath) {
        return fsInvoke('stat', String(filePath));
    },
    async writeFile(filePath, data, encoding) {
        const p = String(filePath);
        if(typeof data === 'string') {
            const enc = encoding == null ? 'utf8' : String(encoding).toLowerCase();
            if(enc !== 'utf8' && enc !== 'utf-8') {
                throw new Error('writeFile with string data only supports utf-8');
            }
            await fsInvoke('writeFile', p, { kind: 'utf8', data });
            return;
        }
        if(data instanceof Uint8Array) {
            await fsInvoke('writeFile', p, { kind: 'buffer', data: Array.from(data) });
            return;
        }
        throw new TypeError('writeFile data must be string or Uint8Array');
    },
    mkdir(dirPath, options) {
        return fsInvoke('mkdir', String(dirPath), options || {});
    },
    rm(targetPath, options) {
        return fsInvoke('rm', String(targetPath), options || {});
    },
    rename(fromPath, toPath) {
        return fsInvoke('rename', String(fromPath), String(toPath));
    },
};

module.exports = Object.freeze(fs);
