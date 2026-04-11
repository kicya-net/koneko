import { createApis } from './api/index.js';

export class SiteWorker {
    constructor(siteId, siteRoot, koneko) {
        this.isolate = null;
        this.context = null;
        this.entryId = null;
        this.siteId = siteId;
        this.siteRoot = siteRoot;
        this.cpuTimeout = koneko.cpuTimeout;
        this.wallTimeout = koneko.wallTimeout;
        this.compiledFns = new Set();
        this.lastUsed = Date.now();
        this.active = false;
        this.koneko = koneko;
    }
    async init() {
        this.isolate = await this.koneko.isolatePool.acquire();
        this.entryId = `${this.siteId}:${this.isolate.id}`;
        this.context = await this.isolate.i.createContext();
        await createApis(this);
    }
    setActive(active) {
        this.isolate.busy = active;
        this.active = active;
        this.lastUsed = Date.now();
        if(!active) {
            this.koneko.isolatePool.release(this.isolate);
        }
    }
    async evalClosure(code, args, options) {
        return await this.runWithWatchdog(async () => {
            return await this.context.evalClosure(code, args, options);
        });
    }
    async runScript(script) {
        return await this.runWithWatchdog(async () => {
            return await script.run(this.context, {
                timeout: this.wallTimeout,
            });
        });
    }
    async runWithWatchdog(fn) {
        this.setActive(true);
        const cpuTimeBefore = this.isolate.i.cpuTime;
        const task = {
            isolate: this.isolate,
            cpuTimeBefore,
            cpuTimeout: this.cpuTimeout,
            cpuLimited: false,
        };
        this.koneko.watchdogTasks.add(task);
        try {
            return await fn();
        } catch (err) {
            if (task.cpuLimited) throw new Error('CPU limit exceeded');
            throw err;
        } finally {
            this.koneko.watchdogTasks.delete(task);
            this.setActive(false);
        }
    }
}
