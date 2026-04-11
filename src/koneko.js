import ivm from 'isolated-vm';
import { IsolatePool } from './isolates.js';
import { createApis } from './api/index.js';
import { compileTemplate } from './compile.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

class SiteWorker {
    constructor(siteId, siteRoot, isolate, context) {
        this.siteId = siteId;
        this.siteRoot = siteRoot;
        this.isolate = isolate;
        this.context = context;
        this.entryId = `${siteId}:${isolate.id}`;
        this.compiledCodeCache = new Map(); // siteId:filePath:mtime:size -> compiled code
        this.lastUsed = Date.now();
        this.active = false;
    }
    async init() {
        await createApis(this);
    }
}

export class Koneko {
    constructor(options) {
        this.isolatePool = new IsolatePool(options.isolateCount, options.memoryLimit);
        this.sites = new Map(); // entryId -> SiteWorker
        this.compiledTemplateCache = new Map(); // siteId:filePath:mtime:size -> compiled template function source
        this.wallTimeout = options.wallTimeout || 5000;
        this.cpuTimeout = options.cpuTimeout || 25000000n; // ns (default 25ms)
        this.evictionInterval = setInterval(() => this.evict(), 30_000);
        this.evictionInterval.unref();
    }
    evict() {
        const now = Date.now();
        const siteCounts = new Map();
    
        for (const entry of this.sites.values()) {
            siteCounts.set(entry.siteId, (siteCounts.get(entry.siteId) || 0) + 1);
        }
    
        for (const [entryId, entry] of this.sites) {
            if (entry.active) continue;
            if (entry.isolate.i.isDisposed) {
                this.sites.delete(entryId);
                continue;
            }
    
            const count = siteCounts.get(entry.siteId);
            const ttl = count > 1 ? 30_000 : 60_000; // 30s for multiple contexts, 60s for the last context
    
            if (now - entry.lastUsed > ttl) {
                entry.context.release();
                this.sites.delete(entryId);
                siteCounts.set(entry.siteId, count - 1);
            }
        }
    }
    async acquireSite(siteId, siteRoot) {
        for (const entry of this.sites.values()) {
            if (entry.siteId === siteId && !entry.isolate.busy && !entry.isolate.i.isDisposed) {
              entry.isolate.busy = true;
              return entry;
            }
        }
        
        let isolate = null;
        try {
            isolate = await this.isolatePool.acquire();    
            const context = await isolate.i.createContext();
    
            const siteWorker = new SiteWorker(siteId, siteRoot, isolate, context);
            await siteWorker.init();
            this.sites.set(siteWorker.entryId, siteWorker);
            isolate.on('dispose', () => this.sites.delete(siteWorker.entryId));
            return siteWorker;
        } catch (error) {
            if(isolate) this.isolatePool.release(isolate);
            throw error;
        }
    }

    assembleRequest(expressRequest = {}) {
        const headers = Object.fromEntries(Object.entries(expressRequest.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));

        return {
            url: expressRequest.url,
            method: expressRequest.method,
            headers,
        };
    }

    async runWithWatchdog(site, fn) {
        const cpuTimeBefore = site.isolate.i.cpuTime;
        let cpuLimited = false;
        const watchdog = setInterval(() => {
            if (site.isolate.i.isDisposed) {
                clearInterval(watchdog);
                return;
            }
            if (site.isolate.i.cpuTime - cpuTimeBefore > this.cpuTimeout) {
                cpuLimited = true;
                clearInterval(watchdog);
                site.isolate.dispose();
            }
        }, 5);

        try {
            return await fn();
        } catch (err) {
            if (cpuLimited) throw new Error('CPU limit exceeded');
            throw err;
        } finally {
            clearInterval(watchdog);
        }
    }

    async runTemplate(fnName, site, request) {
        site.active = true;
        try {
            const req = this.assembleRequest(request);
            const body = await this.runWithWatchdog(site, async () => {
                return await site.context.evalClosure(`return ${fnName}($0)`, [new ivm.ExternalCopy(req).copyInto()], {
                    timeout: this.wallTimeout,
                    result: { promise: true, copy: true },
                    arguments: { reference: false },
                });
            });

            return body;
        } finally {
            site.active = false;
            site.lastUsed = Date.now();
            if(site.isolate.i.isDisposed) {
                site.isolate.dispose();
            }
            this.isolatePool.release(site.isolate);
        }
    }

    async renderCode(code, { siteId, siteRoot, request }) {
        const site = await this.acquireSite(siteId, siteRoot);
        const templateCode = compileTemplate(code, '__template');
        const fn = await site.isolate.i.compileScript(templateCode);
        await this.runWithWatchdog(site, async () => {
            return await fn.run(site.context);
        });
        return await this.runTemplate('__template', site, request);
    }

    async renderFile(filePath, { siteId, siteRoot, request }) {
        // Validate file path
        const fullSitePath = path.resolve(siteRoot);
        const fullFilePath = path.join(fullSitePath, filePath);
        if(!fullFilePath.startsWith(fullSitePath + path.sep)) {
            throw new Error('Invalid file path');
        }

        let stat = fsSync.statSync(fullFilePath);
        if(!stat.isFile()) {
            throw new Error('Not a file: ' + filePath);
        }
        const templateKey = `${siteId}:${filePath}:${stat.mtime.getTime()}:${stat.size}`;
        const fnName = `__t_${`${siteId}_${filePath}`.replace(/[^a-zA-Z0-9]/g, '_')}`;
        let template = this.compiledTemplateCache.get(templateKey);
        if(!template) {
            template = await fs.readFile(fullFilePath, 'utf-8');
            template = compileTemplate(template, fnName);
            this.compiledTemplateCache.set(templateKey, template);
        }

        const site = await this.acquireSite(siteId, siteRoot);
        let fn = site.compiledCodeCache.get(fnName);
        if(!fn) {
            fn = await site.isolate.i.compileScript(template);
            await this.runWithWatchdog(site, async () => {
                return await fn.run(site.context);
            });
            site.compiledCodeCache.set(fnName, fn);
        }

        return await this.runTemplate(fnName, site, request);
    }
}