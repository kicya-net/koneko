import { Koneko } from '../koneko.js';
import { applyResponseHeaders, buildRequest, konekoHelpers, generateError } from './utils.js';
import path from 'node:path';
import fs from 'node:fs';

export function konekoMiddleware(options = {}) {
    const clean = options.clean ?? false;
    const koneko = options.koneko ?? new Koneko(options.konekoOptions);
    const siteRoot = options.siteRoot;
    if(!siteRoot) throw new Error('options.siteRoot is required');
    if(siteRoot !== path.resolve(siteRoot)) throw new Error('options.siteRoot must be an absolute path');
    const helpers = konekoHelpers(options.maxFileSize ?? 20 * 1024 * 1024);

    async function handle(req, res, next) {
        const siteId = req.hostname ?? 'default';
        const lastPart = req.path.split('/').pop();
        const needsCheck = lastPart.endsWith('.cat') || (clean && !lastPart.includes('.')) || req.path.endsWith("/");
        if(!needsCheck) return next();

        let filePath = req.path;
        if(req.path.endsWith("/")) filePath += "index.cat";
        if(!filePath.endsWith(".cat")) filePath += ".cat";

        try {
            const sitePath = path.resolve(siteRoot);
            const fullFilePath = path.join(sitePath, filePath);
            if(!fullFilePath.startsWith(sitePath + path.sep)) return next();

            const stat = fs.statSync(fullFilePath);
            if(!stat.isFile()) return next();
        } catch(e) {
            return next();
        }

        try {
            const body = await koneko.renderFile(filePath, { siteId, siteRoot, request: buildRequest(req) });
            applyResponseHeaders(res, body.response.headers);
            res.status(body.response.status);
            res.send(body.body);
        } catch(e) {
            return res.status(500).send(generateError(500, e.message));
        }
    }

    return async (req, res, next) => {
        helpers(req, res, () => handle(req, res, next));
    };
}