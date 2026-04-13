import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { LRUCache } from 'lru-cache';

function createWorkerError(error, fallbackMessage) {
    const out = new Error(error?.message || fallbackMessage);
    out.name = error?.name || 'Error';
    if(error?.stack) {
        out.stack = error.stack;
    }
    if(error?.code) {
        out.code = error.code;
    }
    return out;
}

class SqliteClient {
    constructor(sqliteDir, busyTimeoutMs) {
        this.sqliteDir = sqliteDir;
        this.closed = false;
        this.pending = new Map();
        this.nextId = 1;
        this.worker = new Worker(new URL('./db-worker.js', import.meta.url), {
            workerData: {
                sqliteDir,
                busyTimeoutMs,
            },
        });
        this.worker.unref();
        this.ready = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        this.worker.on('message', (message) => {
            if(message?.type === 'ready') {
                this.resolveReady();
                this.resolveReady = null;
                this.rejectReady = null;
                return;
            }
            if(message?.type === 'initError') {
                const error = createWorkerError(message.error, 'Failed to initialize SQLite worker');
                if(this.rejectReady) {
                    this.rejectReady(error);
                }
                this.resolveReady = null;
                this.rejectReady = null;
                this._fail(error);
                return;
            }
            const pending = this.pending.get(message.id);
            if(!pending) {
                return;
            }
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if(message.ok) {
                pending.resolve(message.result);
                return;
            }
            pending.reject(createWorkerError(message.error, 'SQLite worker query failed'));
        });
        this.worker.on('error', (error) => {
            this._fail(error);
        });
        this.worker.on('exit', (code) => {
            if(this.closed) {
                return;
            }
            const error = new Error(code === 0 ? 'SQLite worker exited' : `SQLite worker exited with code ${code}`);
            error.code = 'SQLITE_WORKER_EXIT';
            this._fail(error);
        });
    }

    _fail(error) {
        if(this.closed) {
            return;
        }
        this.closed = true;
        if(this.rejectReady) {
            this.rejectReady(error);
            this.resolveReady = null;
            this.rejectReady = null;
        }
        for(const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }

    async call(op, dbName, sql, params, timeoutMs) {
        await this.ready;
        if(this.closed) {
            const error = new Error('SQLite connection is closed');
            error.code = 'SQLITE_CLOSED';
            throw error;
        }
        const id = this.nextId++;
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                const error = new Error(`SQLite ${dbName}.${op} timed out after ${timeoutMs}ms`);
                error.code = 'SQLITE_TIMEOUT';
                void this.close();
                reject(error);
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.worker.postMessage({ id, op, dbName, sql, params });
        });
    }

    async close() {
        if(this.closed) {
            return;
        }
        this.closed = true;
        for(const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            const error = new Error('SQLite connection was closed');
            error.code = 'SQLITE_CLOSED';
            pending.reject(error);
        }
        this.pending.clear();
        if(this.worker) {
            const worker = this.worker;
            this.worker = null;
            await worker.terminate();
        }
    }
}

const sqliteCache = new LRUCache({
    max: 32,
    ttl: 10 * 60 * 1000,
    updateAgeOnGet: true,
    dispose(client) {
        void client.close();
    },
});

function normalizeParams(params) {
    if(params == null) {
        return null;
    }
    if(Array.isArray(params) || typeof params === 'object') {
        return params;
    }
    throw new TypeError('SQLite params must be an array, object, or omitted');
}

function getSqliteClient(sqliteDir, busyTimeoutMs) {
    let client = sqliteCache.get(sqliteDir);
    if(client) {
        return client;
    }
    client = new SqliteClient(sqliteDir, busyTimeoutMs);
    sqliteCache.set(sqliteDir, client);
    client.ready.catch(() => {
        if(sqliteCache.get(sqliteDir) === client) {
            sqliteCache.delete(sqliteDir);
        }
    });
    return client;
}

export function createSqliteBridge(sqliteDir, options = {}) {
    const configuredDir = sqliteDir == null || sqliteDir === ''
        ? null
        : path.resolve(String(sqliteDir));
    if(configuredDir) {
        fs.mkdirSync(configuredDir, { recursive: true });
    }
    const queryTimeoutMs = Math.max(1, Number(options.queryTimeoutMs) || 5000);
    const busyTimeoutMs = Math.max(0, Math.min(queryTimeoutMs, Number(options.busyTimeoutMs ?? queryTimeoutMs)));

    return async function sqliteBridge(op, ...args) {
        if(!configuredDir) {
            throw new Error('SQLite directory is not configured for this site');
        }
        const dbName = String(args[0]);
        const client = getSqliteClient(configuredDir, busyTimeoutMs);
        try {
            if(op === 'get') {
                return await client.call('get', dbName, String(args[1]), normalizeParams(args[2]), queryTimeoutMs);
            }
            if(op === 'all') {
                return await client.call('all', dbName, String(args[1]), normalizeParams(args[2]), queryTimeoutMs);
            }
            if(op === 'run') {
                return await client.call('run', dbName, String(args[1]), normalizeParams(args[2]), queryTimeoutMs);
            }
            if(op === 'query') {
                return {
                    rows: await client.call('all', dbName, String(args[1]), normalizeParams(args[2]), queryTimeoutMs),
                };
            }
            if(op === 'exec') {
                return await client.call('run', dbName, String(args[1]), normalizeParams(args[2]), queryTimeoutMs);
            }
            throw new Error('Unknown sqlite operation');
        } catch(error) {
            if(error?.code === 'SQLITE_TIMEOUT' || error?.code === 'SQLITE_CLOSED' || error?.code === 'SQLITE_WORKER_EXIT') {
                if(sqliteCache.get(configuredDir) === client) {
                    sqliteCache.delete(configuredDir);
                }
            }
            throw error;
        }
    };
}

export function __sqliteCacheSize() {
    return sqliteCache.size;
}

export async function __clearSqliteCache() {
    const clients = [...sqliteCache.values()];
    sqliteCache.clear();
    await Promise.all(clients.map((client) => client.close().catch(() => {})));
}
