import { Koneko } from '../koneko.js';
import { applyResponseHeaders, buildRequest, konekoHelpers } from './utils.js';
import { buildRouteTree, matchRoute, routeCheckIntervalMs } from './routes.js';
import path from 'node:path';

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
    const routeCheckInterval = options.routeCheckIntervalMs ?? routeCheckIntervalMs;
    let routeTree = buildRouteTree(publicPath, clean);
    let routeCheckedAt = Date.now();

    async function handle(req, res, next) {
        const siteId = req.hostname ?? 'default';
        const lastPart = req.path.split('/').pop();
        const canTryRoute = lastPart.endsWith('.cat') || !lastPart.includes('.') || req.path.endsWith("/");
        if(!canTryRoute) return next();

        const now = Date.now();
        if(now - routeCheckedAt >= routeCheckInterval) {
            routeTree = buildRouteTree(publicPath, clean);
            routeCheckedAt = now;
        }

        const route = matchRoute(routeTree, req.path);
        if(!route) return next();

        try {
            const renderFilePath = path.relative(sitePath, route.fullFilePath).replace(/\\/g, '/');
            const body = await koneko.renderFile(renderFilePath, { siteId, siteRoot, sqliteDir, request: buildRequest(req, route.params) });
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