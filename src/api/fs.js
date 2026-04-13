import fs from 'node:fs';
import path from 'node:path';

function resolveUnderSiteRoot(siteRoot, relPath) {
    const root = path.resolve(siteRoot);
    const normalized = String(relPath).replace(/^[/\\]+/, '');
    const full = path.resolve(root, normalized);
    if(full !== root && !full.startsWith(root + path.sep)) {
        throw new Error('Invalid file path: ' + relPath);
    }
    return full;
}

export function createFsBridge(siteRoot) {
    async function readFile(relPath, mode) {
        const full = resolveUnderSiteRoot(siteRoot, relPath);
        const st = await fs.promises.stat(full);
        if(!st.isFile()) {
            throw new Error('Not a file: ' + relPath);
        }
        if(mode === 'utf8') {
            return await fs.promises.readFile(full, 'utf8');
        }
        if(mode === 'buffer') {
            const buf = await fs.promises.readFile(full);
            return Array.from(buf);
        }
        throw new Error('Invalid read mode');
    }

    async function readdir(relPath) {
        const full = resolveUnderSiteRoot(siteRoot, relPath);
        const st = await fs.promises.stat(full);
        if(!st.isDirectory()) {
            throw new Error('Not a directory: ' + relPath);
        }
        const entries = await fs.promises.readdir(full, { withFileTypes: true });
        return entries.map((d) => ({
            name: d.name,
            isFile: d.isFile(),
            isDirectory: d.isDirectory(),
        }));
    }

    async function stat(relPath) {
        const full = resolveUnderSiteRoot(siteRoot, relPath);
        const st = await fs.promises.lstat(full);
        return {
            size: st.size,
            mtimeMs: st.mtimeMs,
            isFile: st.isFile(),
            isDirectory: st.isDirectory(),
            isSymbolicLink: st.isSymbolicLink(),
        };
    }

    async function writeFile(relPath, payload) {
        const full = resolveUnderSiteRoot(siteRoot, relPath);
        if(payload.kind === 'utf8') {
            await fs.promises.mkdir(path.dirname(full), { recursive: true });
            await fs.promises.writeFile(full, String(payload.data), 'utf8');
            return;
        }
        if(payload.kind === 'buffer') {
            await fs.promises.mkdir(path.dirname(full), { recursive: true });
            await fs.promises.writeFile(full, Buffer.from(payload.data));
            return;
        }
        throw new Error('Invalid write payload');
    }

    async function mkdir(relPath, options) {
        const full = resolveUnderSiteRoot(siteRoot, relPath);
        await fs.promises.mkdir(full, { recursive: Boolean(options && options.recursive) });
    }

    async function rm(relPath, options) {
        const full = resolveUnderSiteRoot(siteRoot, relPath);
        await fs.promises.rm(full, {
            force: Boolean(options && options.force),
            recursive: Boolean(options && options.recursive),
            maxRetries: 3,
        });
    }

    async function rename(fromPath, toPath) {
        const fullFrom = resolveUnderSiteRoot(siteRoot, fromPath);
        const fullTo = resolveUnderSiteRoot(siteRoot, toPath);
        await fs.promises.mkdir(path.dirname(fullTo), { recursive: true });
        await fs.promises.rename(fullFrom, fullTo);
    }

    return async function fsBridge(op, ...args) {
        switch(op) {
            case 'readFile':
                return readFile(args[0], args[1]);
            case 'readdir':
                return readdir(args[0]);
            case 'stat':
                return stat(args[0]);
            case 'writeFile':
                return writeFile(args[0], args[1]);
            case 'mkdir':
                return mkdir(args[0], args[1]);
            case 'rm':
                return rm(args[0], args[1]);
            case 'rename':
                return rename(args[0], args[1]);
            default:
                throw new Error('Unknown fs operation');
        }
    };
}
