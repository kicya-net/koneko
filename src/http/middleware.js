import { Koneko } from '../koneko.js';
import { applyResponseHeaders, buildRequest, konekoHelpers } from './utils.js';
import path from 'node:path';
import fs from 'node:fs';

export function konekoMiddleware(options = {}) {
    const clean = options.clean ?? false;
    const koneko = options.koneko ?? new Koneko(options.konekoOptions);
    const siteRoot = options.siteRoot;
    const sqliteDir = options.sqliteDir ?? null;
    if(!siteRoot) throw new Error('options.siteRoot is required');
    if(!path.isAbsolute(siteRoot)) throw new Error('options.siteRoot must be an absolute path');
    const sitePath = siteRoot;
    const publicPath = options.publicDir ? (path.isAbsolute(options.publicDir) ? options.publicDir : path.join(sitePath, options.publicDir)) : sitePath;
    const helpers = konekoHelpers(options.maxFileSize ?? 20 * 1024 * 1024);

    async function handle(req, res, next) {
        const siteId = req.hostname ?? 'default';
        const lastPart = req.path.split('/').pop();
        const canTryExact = lastPart.endsWith('.cat') || (clean && !lastPart.includes('.')) || req.path.endsWith("/");
        const canTryCatchall = lastPart.endsWith('.cat') || !lastPart.includes('.') || req.path.endsWith("/");
        if(!canTryExact && !canTryCatchall) return next();

        let fullFilePath = null;
        if(canTryExact) {
            let filePath = req.path;
            if(req.path.endsWith("/")) filePath += "index.cat";
            if(!filePath.endsWith(".cat")) filePath += ".cat";

            try {
                const candidatePath = path.join(publicPath, filePath);
                if(!candidatePath.startsWith(publicPath + path.sep)) return next();
                const stat = fs.statSync(candidatePath);
                if(stat.isFile()) fullFilePath = candidatePath;
            } catch {}
        }

        if(!fullFilePath && canTryCatchall) {
            let dirPath = req.path.endsWith('/') ? req.path : path.posix.dirname(req.path);
            if(!dirPath.endsWith('/')) dirPath += '/';

            while(true) {
                try {
                    const candidatePath = path.join(publicPath, path.posix.join(dirPath, '_catchall.cat'));
                    if(!candidatePath.startsWith(publicPath + path.sep)) return next();
                    const stat = fs.statSync(candidatePath);
                    if(stat.isFile()) {
                        fullFilePath = candidatePath;
                        break;
                    }
                } catch {}

                if(dirPath === '/') break;
                dirPath = path.posix.dirname(dirPath.slice(0, -1));
                if(!dirPath.endsWith('/')) dirPath += '/';
            }
        }

        if(!fullFilePath) return next();

        try {
            const renderFilePath = path.relative(sitePath, fullFilePath).replace(/\\/g, '/');
            const body = await koneko.renderFile(renderFilePath, { siteId, siteRoot, sqliteDir, request: buildRequest(req) });
            applyResponseHeaders(res, body.response.headers);
            res.status(body.response.status);
            res.send(body.body);
        } catch(e) {
            return next(e);
        }
    }

    return async (req, res, next) => {
        helpers(req, res, () => handle(req, res, next));
    };
}