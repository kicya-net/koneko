const path = Object.freeze({
    dirname(filePath) {
        filePath = String(filePath);
        const idx = filePath.lastIndexOf('/');
        return idx === -1 ? '' : filePath.slice(0, idx + 1);
    },
    resolve(baseDir, targetPath) {
        baseDir = String(baseDir);
        targetPath = String(targetPath);
        const parts = (targetPath.startsWith('/') ? targetPath : `${baseDir}${targetPath}`).split('/');
        const resolvedParts = [];
        for(const part of parts) {
            if(!part || part === '.') continue;
            if(part === '..') {
                if(resolvedParts.length) resolvedParts.pop();
                continue;
            }
            resolvedParts.push(part);
        }
        return '/' + resolvedParts.join('/');
    },
    join(...parts) {
        return this.resolve('/', parts.join('/'));
    },
    resolveRequire(fromFilePath, requiredPath) {
        return this.resolve(this.dirname(fromFilePath), requiredPath);
    },
});
