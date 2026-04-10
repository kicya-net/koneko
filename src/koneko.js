import { IsolatePool } from './isolates.js';
import { createApis } from './api/index.js';
import { compile } from './compile.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

class SiteWorker {
    constructor(siteId, siteRoot, isolate, context) {
        this.siteId = siteId;
        this.siteRoot = siteRoot;
        this.isolate = isolate;
        this.context = context;
        this.entryId = `${siteId}-${isolate.id}`;
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

    async render(content, { siteId, siteRoot, request }) {
        const site = await this.acquireSite(siteId, siteRoot);
        site.active = true;
        try {
            // Compile
            const code = compile(content, { request });

            // Run
            const script = await site.isolate.i.compileScript(code);
            const cpuTimeBefore = site.isolate.i.cpuTime;
            const body = await new Promise((resolve, reject) => {
                const watchdog = setInterval(() => {
                    if (site.isolate.isDisposed) {
                        clearInterval(watchdog);
                        return;
                    }
                    if (site.isolate.i.cpuTime - cpuTimeBefore > this.cpuTimeout) {
                        clearInterval(watchdog);
                        site.isolate.dispose();
                        reject(new Error('CPU limit exceeded'));
                    }
                }, 5);
                watchdog.unref();
    
                script.run(site.context, {
                    timeout: this.wallTimeout,
                    promise: true,
                    copy: true,
                })
                .then(result => {
                    clearInterval(watchdog);
                    resolve(result);
                })
                .catch(err => {
                    clearInterval(watchdog);
                    reject(err);
                });
            });

            return body;
        } finally {
            site.active = false;
            site.lastUsed = Date.now();
            this.isolatePool.release(site.isolate);
        }
    }

    async renderFile(filePath, { siteId, siteRoot, request }) {
        // Validate file path
        const fullSitePath = path.resolve(siteRoot);
        const fullFilePath = path.join(fullSitePath, filePath);
        if(!fullFilePath.startsWith(fullSitePath + path.sep)) {
            throw new Error('Invalid file path');
        }

        const content = await readFile(fullFilePath, 'utf-8');
        return await this.render(content, { siteId, siteRoot, request });
    }
}