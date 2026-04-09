import { IsolatePool } from './isolates.js';
import { createApis } from './apis.js';
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
    }
    async init() {
        await createApis(this.context);
    }
}

export class Koneko {
    constructor(options) {
        this.isolatePool = new IsolatePool(options.isolateCount, options.memoryLimit);
        this.sites = new Map(); // entryId -> SiteWorker
        this.wallTimeout = options.wallTimeout || 5000;
        this.cpuTimeout = options.cpuTimeout || 25000000n; // ns (default 25ms)
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
            isolate.on('catastrophicError', () => this.sites.delete(siteWorker.entryId));
            return siteWorker;
        } catch (error) {
            if(isolate) this.isolatePool.release(isolate);
            throw error;
        }
    }

    async render(filePath, { siteId, siteRoot, request }) {
        const site = await this.acquireSite(siteId, siteRoot);

        try {
            // Validate file path
            const fullSitePath = path.resolve(siteRoot);
            const fullFilePath = path.join(fullSitePath, filePath);
            if(!fullFilePath.startsWith(fullSitePath + path.sep)) {
                throw new Error('Invalid file path');
            }

            // Read file content and compile
            const content = await readFile(fullFilePath, 'utf8');
            const code = compile(content);

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
    
                script.run(site.context, {
                    timeout: this.wallTimeout,
                    promise: true
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
        } catch(e) {
            throw e;
        } finally {
            this.isolatePool.release(site.isolate);
        }
    }
}