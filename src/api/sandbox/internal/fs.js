function hostFs(op) {
    const args = Array.prototype.slice.call(arguments, 1);
    return internals.fsInvoke.apply(internals, [op].concat(args));
}

const fs = {
    async readFile(filePath, encoding) {
        const p = String(filePath);
        const enc = encoding == null || encoding === undefined
            ? null
            : String(encoding).toLowerCase();
        if(enc === 'utf8' || enc === 'utf-8') {
            return await hostFs('readFile', p, 'utf8');
        }
        const bytes = await hostFs('readFile', p, 'buffer');
        return new Uint8Array(bytes).buffer;
    },
    readdir(dirPath) {
        return hostFs('readdir', String(dirPath));
    },
    stat(filePath) {
        return hostFs('stat', String(filePath));
    },
    async writeFile(filePath, data, encoding) {
        const p = String(filePath);
        if(typeof data === 'string') {
            const enc = encoding == null ? 'utf8' : String(encoding).toLowerCase();
            if(enc !== 'utf8' && enc !== 'utf-8') {
                throw new Error('writeFile with string data only supports utf-8');
            }
            await hostFs('writeFile', p, { kind: 'utf8', data });
            return;
        }
        if(data instanceof Uint8Array) {
            await hostFs('writeFile', p, { kind: 'buffer', data: Array.from(data) });
            return;
        }
        throw new TypeError('writeFile data must be string or Uint8Array');
    },
    mkdir(dirPath, options) {
        return hostFs('mkdir', String(dirPath), options || {});
    },
    rm(targetPath, options) {
        return hostFs('rm', String(targetPath), options || {});
    },
    rename(fromPath, toPath) {
        return hostFs('rename', String(fromPath), String(toPath));
    },
};

module.exports = Object.freeze(fs);
