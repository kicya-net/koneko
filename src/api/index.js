import fs from 'node:fs';
import path from 'node:path';
import { compileTemplate } from '../compile.js';
import { safeFetch } from './net.js';

const sandboxDir = new URL('./sandbox/', import.meta.url);
const sandboxFiles = fs.readdirSync(sandboxDir)
    .filter((name) => name.endsWith('.js') && name !== 'prefix.js')
    .sort((a, b) => {
        if(a === 'bootstrap.js') return 1;
        if(b === 'bootstrap.js') return -1;
        return a.localeCompare(b);
    });
const SANDBOX_CODE = sandboxFiles
    .map((name) => fs.readFileSync(new URL(`./sandbox/${name}`, import.meta.url), 'utf-8'))
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
        return await fs.promises.readFile(fullFilePath, 'utf-8');
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
        return compiledTemplateCode;
    }

    const [code, args] = buildSandboxClosure(SANDBOX_CODE, {
        getModule,
        getTemplateCode,
        safeFetch: async (url, options) => safeFetch(url, options),
    });

    await siteWorker.context.evalClosure(code, args, {
        arguments: { reference: true },
    });
}