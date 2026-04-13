/*
Copyright 2026 Kicya

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import path from 'node:path';
import { createApis } from './api/index.js';

export class SiteWorker {
    constructor(siteId, siteRoot, sqliteDir, koneko) {
        this.isolate = null;
        this.context = null;
        this.entryId = null;
        this.siteId = siteId;
        this.siteRoot = siteRoot;
        this.sqliteDir = sqliteDir;
        this.wallTimeout = koneko.wallTimeout;
        this.lastUsed = Date.now();
        this.active = false;
        this.koneko = koneko;
    }
    async init() {
        this.isolate = await this.koneko.isolatePool.acquire();
        this.entryId = `${this.siteId}:${this.isolate.id}`;
        this.context = await this.isolate.i.createContext();

        const resolvedSiteRoot = path.resolve(this.siteRoot);
        if(resolvedSiteRoot !== this.siteRoot) {
            this.siteRoot = resolvedSiteRoot;
        }
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
    async compileScript(code) {
        try {
            return await this.isolate.i.compileScript(code);
        } catch (err) {
            if(this.isolate.i.isDisposed) this.isolate.dispose();
            throw err;
        }
    }
    async runWithWatchdog(fn) {
        this.setActive(true);
        const cpuTimeBefore = this.isolate.i.cpuTime;
        const task = {
            isolate: this.isolate,
            cpuTimeBefore,
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
