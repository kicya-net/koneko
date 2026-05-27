import path from 'node:path';
import fs from 'node:fs';

export const routeCheckIntervalMs = 1000;

function createRouteNode() {
    return {
        static: new Map(),
        param: null,
        route: null,
        trailingSlashRoute: null,
    };
}

function parseParamSegment(segment) {
    const match = segment.match(/^\[([^\]/]+)\]$/);
    return match?.[1] ?? null;
}

function normalizeRoutePath(routePath) {
    return String(routePath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function insertRoute(root, segments, filePath, trailingSlashOnly = false) {
    let node = root;
    for(const segment of segments) {
        const paramName = parseParamSegment(segment);
        if(paramName) {
            if(!node.param) node.param = { name: paramName, node: createRouteNode() };
            node = node.param.node;
        } else {
            if(!node.static.has(segment)) node.static.set(segment, createRouteNode());
            node = node.static.get(segment);
        }
    }
    if(trailingSlashOnly) {
        node.trailingSlashRoute = filePath;
    } else {
        node.route = filePath;
    }
}

export function buildRouteTree(publicPath, clean) {
    const root = createRouteNode();
    const stack = [{ dir: publicPath, segments: [] }];

    while(stack.length) {
        const current = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(current.dir, { withFileTypes: true });
        } catch {
            continue;
        }

        for(const entry of entries) {
            const fullPath = path.join(current.dir, entry.name);
            if(entry.isDirectory()) {
                stack.push({ dir: fullPath, segments: current.segments.concat(entry.name) });
                continue;
            }
            if(!entry.isFile() || !entry.name.endsWith('.cat')) {
                continue;
            }

            const nameWithoutExt = entry.name.slice(0, -4);
            insertRoute(root, current.segments.concat(entry.name), fullPath);
            if(entry.name === 'index.cat') {
                insertRoute(root, current.segments, fullPath, true);
            }
            if(clean || parseParamSegment(nameWithoutExt)) {
                insertRoute(root, current.segments.concat(nameWithoutExt), fullPath);
            }
        }
    }

    return root;
}

export function matchRoute(root, reqPath) {
    const hasTrailingSlash = reqPath.endsWith('/');
    const segments = reqPath.split('/').filter(Boolean);
    let node = root;
    const params = {};

    for(const segment of segments) {
        const staticNode = node.static.get(segment);
        if(staticNode) {
            node = staticNode;
            continue;
        }
        if(!node.param) {
            return null;
        }
        params[node.param.name] = segment;
        node = node.param.node;
    }

    const fullFilePath = hasTrailingSlash ? (node.trailingSlashRoute ?? node.route) : node.route;
    if(!fullFilePath) {
        return null;
    }
    return { fullFilePath, params };
}

export function deriveRouteParams(filePath, reqPath, publicDir = 'public') {
    let routeFilePath = normalizeRoutePath(filePath);
    const publicPrefix = normalizeRoutePath(publicDir);
    if(publicPrefix && publicPrefix !== '.') {
        if(routeFilePath === publicPrefix) {
            return {};
        }
        if(!routeFilePath.startsWith(publicPrefix + '/')) {
            return {};
        }
        routeFilePath = routeFilePath.slice(publicPrefix.length + 1);
    }

    if(routeFilePath === 'index.cat') {
        routeFilePath = '';
    } else if(routeFilePath.endsWith('/index.cat')) {
        routeFilePath = routeFilePath.slice(0, -'/index.cat'.length);
    } else if(routeFilePath.endsWith('.cat')) {
        routeFilePath = routeFilePath.slice(0, -'.cat'.length);
    }

    const templateSegments = routeFilePath.split('/').filter(Boolean);
    const reqSegments = String(reqPath).split('/').filter(Boolean);
    const hasParams = templateSegments.some((segment) => parseParamSegment(segment));
    if(templateSegments.length !== reqSegments.length) {
        return hasParams ? null : {};
    }

    const params = {};
    for(let i = 0; i < templateSegments.length; i++) {
        const paramName = parseParamSegment(templateSegments[i]);
        if(paramName) {
            params[paramName] = reqSegments[i];
        } else if(templateSegments[i] !== reqSegments[i]) {
            return hasParams ? null : {};
        }
    }
    return params;
}
