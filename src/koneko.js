import { IsolatePool } from './isolates.js';
import { createApis } from './apis.js';

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
    }
    async acquireSite(siteId, siteRoot) {
        for (const entry of this.sites.values()) {
            if (entry.siteId === siteId && !entry.isolate.busy && !entry.isolate.isDisposed) {
              entry.isolate.busy = true;
              return entry;
            }
        }
        
        let isolate = null;
        try {
            isolate = await this.isolatePool.acquire();    
            const context = await isolate.createContext();
    
            const siteWorker = new SiteWorker(siteId, siteRoot, isolate, context);
            await siteWorker.init();
            this.sites.set(siteWorker.entryId, siteWorker);
            return siteWorker;
        } catch (error) {
            if(isolate) this.isolatePool.release(isolate);
            throw error;
        }
    }
}