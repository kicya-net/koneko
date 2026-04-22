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
import path from 'node:path';
import { LRUCache } from 'lru-cache';
import { IsolatePool } from './isolates.js';
import { compileTemplate, templateStackLineOffset } from './compile.js';
import { SiteWorker } from './site.js';

function normalizeFilePath(filePath) {
    if(filePath.startsWith('./')) filePath = filePath.slice(2);
    if(!filePath.startsWith('/')) filePath = '/' + filePath;
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '/');
}

function normalizeSqliteDir(sqliteDir) {
    if(sqliteDir == null || sqliteDir === '') {
        return null;
    }
    return path.resolve(String(sqliteDir));
}

function normalizeRenderError(error, fallbackFilePath) {
    if(!(error instanceof Error) || !error.stack) {
        return error;
    }
    const lines = error.stack.split('\n');
    if(lines.length < 2) {
        return error;
    }
    const frames = [];
    for(const line of lines.slice(1)) {
        let match = line.match(/((?:\/|__template)[^:()]*)\:(\d+):(\d+)\)?$/);
        if(match) {
            let sourceLine = Number(match[2]);
            if(match[1].endsWith('.js')) {
                sourceLine = Math.max(1, sourceLine - 2);
            } else {
                if(sourceLine <= templateStackLineOffset) {
                    continue;
                }
                sourceLine -= templateStackLineOffset;
            }
            const frame = `${match[1]}:${sourceLine}:${match[3]}`;
            if(frames[frames.length - 1] !== frame) {
                frames.push(frame);
            }
            continue;
        }
        match = line.match(/<anonymous>:(\d+):(\d+)\)?$/);
        if(!match) {
            continue;
        }
        const filePathMatch = line.match(/\[as ([^\]]+)\]/);
        const filePath = filePathMatch?.[1] ?? fallbackFilePath;
        const sourceLine = Number(match[1]) - templateStackLineOffset;
        if(sourceLine < 1) {
            continue;
        }
        const frame = `${filePath}:${sourceLine}:${match[2]}`;
        if(frames[frames.length - 1] !== frame) {
            frames.push(frame);
        }
    }
    if(!frames.length) {
        return error;
    }
    error.stack = `${lines[0]}\n${frames.map((frame) => `    at ${frame}`).join('\n')}`;
    return error;
}

export class Koneko {
    constructor(options = {}) {
        this.isolatePool = new IsolatePool(options.isolateCount, options.memoryLimit);
        this.sites = new Map(); // entryId -> SiteWorker
        this.compiledTemplateCache = new LRUCache({ max: 1000, ttl: 60000 * 5}); // siteId:filePath:mtime:size -> compiled template function source
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
            if (entry.isolate.busy) continue;
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
    async acquireSite(siteId, siteRoot, sqliteDir = null) {
        const resolvedSiteRoot = path.resolve(siteRoot);
        const normalizedSqliteDir = normalizeSqliteDir(sqliteDir);
        for (const entry of this.sites.values()) {
            if (
                entry.siteId === siteId
                && entry.siteRoot === resolvedSiteRoot
                && entry.sqliteDir === normalizedSqliteDir
                && !entry.isolate.busy
                && !entry.isolate.i.isDisposed
            ) {
                entry.setBusy(true);
                return entry;
            }
        }

        const siteWorker = new SiteWorker(siteId, resolvedSiteRoot, normalizedSqliteDir, this);
        await siteWorker.init();
        siteWorker.setBusy(true);
        siteWorker.isolate.on('dispose', () => this.sites.delete(siteWorker.entryId));
        this.sites.set(siteWorker.entryId, siteWorker);
        
        return siteWorker;
    }

    async runTemplate(filePath, site, request) {
        const result = await site.evalClosure(`return __k.run($0, $1)`, [
            new ivm.ExternalCopy(request).copyInto(),
            new ivm.ExternalCopy(filePath).copyInto(),
        ], {
            timeout: this.wallTimeout,
            result: { promise: true, copy: true },
            arguments: { reference: false },
        });
    
        if(result && result.ok === false) {
            const err = new Error(result.error?.message || 'Template error');
            if(result.error?.name) err.name = result.error.name;
            if(result.error?.stack) err.stack = result.error.stack;
            err.debugLogs = result.debugLogs;
            throw err;
        }
    
        return {
            body: result.body,
            response: result.response,
        };
    }

    async renderCode(code, { siteId, siteRoot, request, sqliteDir = null }) {
        const site = await this.acquireSite(siteId, siteRoot, sqliteDir);
        try {
            const templateCode = compileTemplate(code, '__template');
            const fn = await site.compileScript(templateCode);
            await site.runScript(fn);
            return await this.runTemplate('__template', site, request);
        } catch (error) {
            throw normalizeRenderError(error, '__template');
        } finally {
            site.setBusy(false);
        }
    }

    async renderFile(filePath, { siteId, siteRoot, request, sqliteDir = null }) {
        filePath = normalizeFilePath(filePath);
        const site = await this.acquireSite(siteId, siteRoot, sqliteDir);
        try {
            return await this.runTemplate(filePath, site, request);
        } catch (error) {
            throw normalizeRenderError(error, filePath);
        } finally {
            site.setBusy(false);
        }
    }
}