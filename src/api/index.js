import fs from 'node:fs';
import path from 'node:path';
import { compileTemplate } from '../compile.js';
import { cryptoBridge } from './crypto.js';
import { createSqliteBridge } from './db.js';
import { createFsBridge } from './fs.js';
import { safeFetch } from './net.js';
import ivm from 'isolated-vm';

const internalSandboxDir = new URL('./sandbox/internal/', import.meta.url);
const internalModuleCodes = Object.fromEntries(
    fs.readdirSync(internalSandboxDir)
        .filter((name) => name.endsWith('.js'))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => [name.slice(0, -3), fs.readFileSync(new URL(`./sandbox/internal/${name}`, import.meta.url), 'utf-8')]),
);
const sandboxFiles = [
    'headers.js',
    'response.js',
    'base64.js',
    'runtime.js',
    'textencoder.js',
    'url.js',
    'debug.js',
    'context.js',
    'require.js',
    'templates.js',
    'bootstrap.js',
];
const SANDBOX_CODE = sandboxFiles
    .map((name) => {
        return fs.readFileSync(new URL(`./sandbox/${name}`, import.meta.url), 'utf-8');
    })
    .join('\n');

function buildSandboxClosure(code, bindings) {
    const names = [];
    const rewrittenCode = code.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
        if(!(name in bindings)) {
            throw new Error(`Unknown sandbox binding: $${name}`);
        }
        let index = names.indexOf(name);
        if(index === -1) {
            index = names.length;
            names.push(name);
        }
        return `$${index}`;
    });
    return [rewrittenCode, names.map((name) => bindings[name])];
}

export async function createApis(siteWorker) {
    if(siteWorker.isolate.i.isDisposed) return;

    async function getModule(filePath) {
        const fullFilePath = path.join(siteWorker.siteRoot, filePath);
        if(!fullFilePath.startsWith(siteWorker.siteRoot + path.sep)) {
            throw new Error('Invalid file path');
        }
        const stat = fs.statSync(fullFilePath);
        if(!stat.isFile()) {
            throw new Error('Not a file: ' + filePath);
        }
        const code = await fs.promises.readFile(fullFilePath, 'utf-8');
        const moduleKey = `${siteWorker.siteId}:${filePath}:${stat.mtime.getTime()}:${stat.size}`;
        return new ivm.ExternalCopy({ code, moduleKey }).copyInto();
    }
    
    async function getModuleKey(filePath) {
        const fullFilePath = path.join(siteWorker.siteRoot, filePath);
        if(!fullFilePath.startsWith(siteWorker.siteRoot + path.sep)) {
            throw new Error('Invalid file path');
        }
        const stat = fs.statSync(fullFilePath);
        if(!stat.isFile()) {
            throw new Error('Not a file: ' + filePath);
        }
        return `${siteWorker.siteId}:${filePath}:${stat.mtime.getTime()}:${stat.size}`;
    }

    async function getTemplateCode(filePath) {
        const fullFilePath = path.join(siteWorker.siteRoot, filePath);
        if(!fullFilePath.startsWith(siteWorker.siteRoot + path.sep)) {
            throw new Error('Invalid file path');
        }
        const stat = fs.statSync(fullFilePath);
        if(!stat.isFile()) {
            throw new Error('Not a file: ' + filePath);
        }
        const templateKey = `${siteWorker.siteId}:${filePath}:${stat.mtime.getTime()}:${stat.size}`;
        let compiledTemplateCode = siteWorker.koneko.compiledTemplateCache.get(templateKey);
        if(!compiledTemplateCode) {
            const templateCode = await fs.promises.readFile(fullFilePath, 'utf-8');
            compiledTemplateCode = compileTemplate(templateCode, filePath);
            siteWorker.koneko.compiledTemplateCache.set(templateKey, compiledTemplateCode);
        }
        return {
            code: compiledTemplateCode,
            templateKey,
        };
    }

    async function getTemplateKey(filePath) {
        const fullFilePath = path.join(siteWorker.siteRoot, filePath);
        if(!fullFilePath.startsWith(siteWorker.siteRoot + path.sep)) {
            throw new Error('Invalid file path');
        }
        const stat = fs.statSync(fullFilePath);
        if(!stat.isFile()) {
            throw new Error('Not a file: ' + filePath);
        }
        return `${siteWorker.siteId}:${filePath}:${stat.mtime.getTime()}:${stat.size}`;
    }

    const fsBridge = createFsBridge(siteWorker.siteRoot);
    const sqliteBridge = createSqliteBridge(siteWorker.sqliteDir, {
        queryTimeoutMs: siteWorker.wallTimeout,
    });
    const [code, args] = buildSandboxClosure(SANDBOX_CODE, {
        getModule,
        getModuleKey,
        getTemplateCode,
        getTemplateKey,
        safeFetch: async (url, options) => safeFetch(url, options),
        cryptoBridge,
        fsBridge,
        sqliteBridge,
        parseUrl(url, base) {
            const parsed = base == null ? new URL(url) : new URL(url, base);
            return {
                protocol: parsed.protocol,
                username: parsed.username,
                password: parsed.password,
                hostname: parsed.hostname,
                port: parsed.port,
                pathname: parsed.pathname,
                search: parsed.search,
                hash: parsed.hash,
            };
        },
        sleep(ms) {
            const delay = Math.max(0, Math.min(Number(ms) || 0, siteWorker.wallTimeout));
            return new Promise((resolve) => setTimeout(resolve, delay));
        },
        internalModuleCodes: () => internalModuleCodes,
    });

    await siteWorker.context.evalClosure(code, args, {
        arguments: { reference: true },
    });
}