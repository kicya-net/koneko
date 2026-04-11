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

import ivm from 'isolated-vm';
import { LRUCache } from 'lru-cache';
import { IsolatePool } from './isolates.js';
import { compileTemplate } from './compile.js';
import { SiteWorker } from './site.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export class Koneko {
    constructor(options) {
        this.isolatePool = new IsolatePool(options.isolateCount, options.memoryLimit);
        this.sites = new Map(); // entryId -> SiteWorker
        this.compiledTemplateCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 60 * 5}); // siteId:filePath:mtime:size -> compiled template function source
        this.wallTimeout = options.wallTimeout || 5000;
        this.cpuTimeout = options.cpuTimeout ?? 25; // ms
        this.evictionInterval = setInterval(() => this.evict(), 30_000);
        this.evictionInterval.unref();
        this.watchdogTasks = new Set();
        this.watchdogInterval = setInterval(() => this.tickWatchdog(), 5);
        this.watchdogInterval.unref();
    }
    tickWatchdog() {
        const limitNs = BigInt(this.cpuTimeout) * 1_000_000n;
        for (const task of this.watchdogTasks) {
            const { isolate, cpuTimeBefore } = task;
            if (isolate.i.isDisposed) continue;
            if (isolate.i.cpuTime - cpuTimeBefore > limitNs) {
                task.cpuLimited = true;
                isolate.dispose();
            }
        }
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
                return entry;
            }
        }

        const siteWorker = new SiteWorker(siteId, siteRoot, this);
        await siteWorker.init();
        siteWorker.isolate.on('dispose', () => this.sites.delete(siteWorker.entryId));
        this.sites.set(siteWorker.entryId, siteWorker);
        
        return siteWorker;
    }

    async runTemplate(fnName, site, request) {
        const body = await site.evalClosure(`return ${fnName}($0)`, [new ivm.ExternalCopy(request).copyInto()], {
            timeout: this.wallTimeout,
            result: { promise: true, copy: true },
            arguments: { reference: false },
        });

        return body;
    }

    async renderCode(code, { siteId, siteRoot, request }) {
        const site = await this.acquireSite(siteId, siteRoot);
        const templateCode = compileTemplate(code, '__template');
        const fn = await site.compileScript(templateCode);
        await site.runScript(fn);
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
        let fn = site.compiledFns.has(templateKey);
        if(!fn) {
            const script = await site.compileScript(template);
            await site.runScript(script);
            site.compiledFns.add(templateKey);
        }

        return await this.runTemplate(fnName, site, request);
    }
}