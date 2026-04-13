import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import path from 'node:path';

const maxSafeBigInt = BigInt(Number.MAX_SAFE_INTEGER);
const minSafeBigInt = BigInt(Number.MIN_SAFE_INTEGER);

function normalizeValue(value) {
    if(typeof value === 'bigint') {
        if(value <= maxSafeBigInt && value >= minSafeBigInt) {
            return Number(value);
        }
        return value.toString();
    }
    if(ArrayBuffer.isView(value)) {
        return Array.from(value);
    }
    if(Array.isArray(value)) {
        return value.map(normalizeValue);
    }
    if(value && typeof value === 'object') {
        const out = {};
        for(const [key, item] of Object.entries(value)) {
            out[key] = normalizeValue(item);
        }
        return out;
    }
    return value;
}

function serializeError(error) {
    return {
        name: error?.name || 'Error',
        message: error?.message || 'Unknown SQLite worker error',
        stack: error?.stack,
        code: error?.code,
    };
}

function hasParams(params) {
    if(params == null) {
        return false;
    }
    if(Array.isArray(params)) {
        return params.length > 0;
    }
    if(typeof params === 'object') {
        return Object.keys(params).length > 0;
    }
    throw new TypeError('SQLite params must be an array, object, or omitted');
}

function runStatement(statement, method, params) {
    if(params == null) {
        return statement[method]();
    }
    if(Array.isArray(params)) {
        return statement[method](...params);
    }
    if(typeof params === 'object') {
        return statement[method](params);
    }
    throw new TypeError('SQLite params must be an array, object, or omitted');
}

const databases = new Map();

function getDatabase(dbName) {
    dbName = String(dbName);
    if(!/^[A-Za-z0-9_-]+$/.test(dbName)) {
        throw new Error('Invalid SQLite database name');
    }
    let database = databases.get(dbName);
    if(database) {
        return database;
    }
    database = new Database(path.join(workerData.sqliteDir, `${dbName}.sqlite`), {
        timeout: Number(workerData.busyTimeoutMs) || 0,
    });
    databases.set(dbName, database);
    return database;
}

try {
    parentPort.postMessage({ type: 'ready' });
} catch(error) {
    parentPort.postMessage({ type: 'initError', error: serializeError(error) });
}

parentPort.on('message', (message) => {
    try {
        const database = getDatabase(message.dbName);
        const sql = String(message.sql);
        if(message.op === 'get') {
            const statement = database.prepare(sql);
            const row = runStatement(statement, 'get', message.params);
            parentPort.postMessage({
                id: message.id,
                ok: true,
                result: normalizeValue(row ?? null),
            });
            return;
        }
        if(message.op === 'all') {
            const statement = database.prepare(sql);
            const rows = runStatement(statement, 'all', message.params);
            parentPort.postMessage({
                id: message.id,
                ok: true,
                result: normalizeValue(rows),
            });
            return;
        }
        if(message.op === 'run') {
            let result;
            if(hasParams(message.params)) {
                const statement = database.prepare(sql);
                result = runStatement(statement, 'run', message.params);
            } else {
                const statement = database.prepare(sql);
                result = statement.run();
            }
            parentPort.postMessage({
                id: message.id,
                ok: true,
                result: normalizeValue({
                    changes: normalizeValue(result?.changes ?? 0),
                    lastInsertRowid: result?.lastInsertRowid == null ? null : normalizeValue(result.lastInsertRowid),
                }),
            });
            return;
        }
        throw new Error('Unknown sqlite operation');
    } catch(error) {
        parentPort.postMessage({
            id: message.id,
            ok: false,
            error: serializeError(error),
        });
    }
});
