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
        return await fsInvoke('readFile', p, 'buffer');
    },
    readdir(dirPath) {
        return fsInvoke('readdir', String(dirPath));
    },
    stat(filePath) {
        return fsInvoke('stat', String(filePath));
    },
    async writeFile(filePath, data, options = {}) {
        const p = String(filePath);
        if(typeof data === 'string') {
            await fsInvoke('writeFile', p, { kind: 'string', data, recursive: options?.recursive });
            return;
        }
        if(ArrayBuffer.isView(data)) {
            await fsInvoke('writeFile', p, {
                kind: 'buffer',
                data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
                recursive: options?.recursive,
            });
            return;
        }
        throw new TypeError('writeFile data must be string or a TypedArray/DataView');
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
