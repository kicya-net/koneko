import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import Database from 'better-sqlite3';

import { __clearSqliteCache, __sqliteCacheSize, createSqliteBridge } from '../src/api/db.js';
import { Koneko } from '../src/koneko.js';

const siteRoot = fs.mkdtempSync(join(tmpdir(), 'koneko-sqlite-site-'));
const sqliteDir = fs.mkdtempSync(join(tmpdir(), 'koneko-sqlite-db-'));

const koneko = new Koneko({
    isolateCount: 1,
    memoryLimit: 32,
    cpuTimeout: 50,
});

await new Promise((resolve) => setTimeout(resolve, 500));

after(async () => {
    await __clearSqliteCache();
    fs.rmSync(siteRoot, { recursive: true, force: true });
    fs.rmSync(sqliteDir, { recursive: true, force: true });
});

async function renderCode(code, sqliteDir) {
    const { body, response } = await koneko.renderCode(code, {
        siteId: 'test-site-sqlite',
        siteRoot,
        sqliteDir,
        request: {},
    });
    assert.equal(response.status, 200);
    assert.equal(response.statusText, '');
    assert.deepEqual(response.headers, {});
    return body.trim();
}

describe('require("sqlite")', () => {
    test('exposes a frozen module', async () => {
        const out = await renderCode('<%= Object.isFrozen(require("sqlite")) %>', sqliteDir);
        assert.equal(out, 'true');
    });

    test('throws when sqlite directory is not configured for the site', async () => {
        const sqliteBridge = createSqliteBridge(null);
        await assert.rejects(
            () => sqliteBridge('query', 'main', 'SELECT 1'),
            /SQLite directory is not configured for this site/,
        );
    });

    test('open(name) returns named databases with positional parameter support', async () => {
        await renderCode('<% await require("sqlite").open("main").exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)") %>', sqliteDir);
        const out = await renderCode(`
            <%
                const db = require("sqlite").open("main");
                await db.exec("INSERT INTO users (name) VALUES (?)", ["koneko"]);
                const result = await db.query("SELECT id, name FROM users WHERE name = ?", ["koneko"]);
            %>
            <%- JSON.stringify(result.rows) %>
        `, sqliteDir);
        assert.equal(out, '[{"id":1,"name":"koneko"}]');
    });

    test('run/get/all helpers work with named and positional parameters', async () => {
        await renderCode('<% await require("sqlite").open("blog").run("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL)") %>', sqliteDir);
        const out = await renderCode(`
            <%
                const db = require("sqlite").open("blog");
                const first = await db.run("INSERT INTO posts (title) VALUES (:title)", { title: "hello" });
                await db.run("INSERT INTO posts (title) VALUES (?)", ["world"]);
                const row = await db.get("SELECT title FROM posts WHERE id = :id", { id: first.lastInsertRowid });
                const rows = await db.all("SELECT title FROM posts ORDER BY id");
            %>
            <%- JSON.stringify({ first, row, rows }) %>
        `, sqliteDir);
        assert.equal(out, '{"first":{"changes":1,"lastInsertRowid":1},"row":{"title":"hello"},"rows":[{"title":"hello"},{"title":"world"}]}');
    });

    test('supports multiple named databases in one configured directory', async () => {
        await __clearSqliteCache();
        const out = await renderCode(`
            <%
                const sqlite = require("sqlite");
                const main = sqlite.open("main");
                const analytics = sqlite.open("analytics");
                await main.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
                await analytics.run("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, kind TEXT NOT NULL)");
                await main.run("INSERT INTO users (name) VALUES (?)", ["main-user"]);
                await analytics.run("INSERT INTO events (kind) VALUES (?)", ["pageview"]);
                const user = await main.get("SELECT name FROM users ORDER BY id DESC LIMIT 1");
                const event = await analytics.get("SELECT kind FROM events ORDER BY id DESC LIMIT 1");
            %>
            <%- JSON.stringify({ user, event }) %>
        `, sqliteDir);
        assert.equal(out, '{"user":{"name":"main-user"},"event":{"kind":"pageview"}}');
        assert.equal(__sqliteCacheSize(), 1);
    });

    test('works from required modules', async () => {
        const dbPath = join(sqliteDir, 'module.sqlite');
        fs.mkdirSync(dirname(dbPath), { recursive: true });
        const db = new Database(dbPath);
        db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
        db.prepare('INSERT INTO users (name) VALUES (?)').run('module-user');
        db.close();
        fs.mkdirSync(join(siteRoot, 'sqlite'), { recursive: true });
        fs.writeFileSync(join(siteRoot, 'sqlite', 'module.js'), [
            'const sqlite = require("sqlite");',
            '',
            'module.exports = async function() {',
            '    const result = await sqlite.open("module").query("SELECT name FROM users WHERE id = ?", [1]);',
            '    return result.rows[0].name;',
            '};',
            '',
        ].join('\n'));
        fs.writeFileSync(join(siteRoot, 'sqlite', 'module.cat'), '<%= await require("./module.js")() %>\n');

        const { body, response } = await koneko.renderFile('sqlite/module.cat', {
            siteId: 'test-site-sqlite-module',
            siteRoot,
            sqliteDir,
            request: {},
        });
        assert.equal(response.status, 200);
        assert.equal(response.statusText, '');
        assert.deepEqual(response.headers, {});
        assert.equal(body.trim(), 'module-user');
    });

    test('query and exec remain compatible aliases', async () => {
        const out = await renderCode(`
            <%
                const db = require("sqlite").open("compat");
                await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
                const inserted = await db.exec("INSERT INTO t (value) VALUES (?)", ["ok"]);
                const queried = await db.query("SELECT value FROM t WHERE id = ?", [inserted.lastInsertRowid]);
            %>
            <%- JSON.stringify({ inserted, queried }) %>
        `, sqliteDir);
        assert.equal(out, '{"inserted":{"changes":1,"lastInsertRowid":1},"queried":{"rows":[{"value":"ok"}]}}');
    });

    test('concurrent sqlite renders with one isolate complete without abandoning promises', async () => {
        await __clearSqliteCache();
        const concurrentKoneko = new Koneko({
            isolateCount: 1,
            memoryLimit: 32,
            cpuTimeout: 50,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

        const results = await Promise.all(
            Array.from({ length: 8 }, (_, index) => concurrentKoneko.renderCode(`
                <%
                    const db = require("sqlite").open("concurrent");
                    await db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
                    await db.run("INSERT INTO users (name) VALUES (?)", ["koneko-${index}"]);
                    const row = await db.get("SELECT name FROM users WHERE id = ?", [${index + 1}]);
                %>
                <%- JSON.stringify(row) %>
            `, {
                siteId: 'sqlite-concurrent',
                siteRoot,
                sqliteDir,
                request: {},
            })),
        );

        assert.equal(results.length, 8);
        for(const { body, response } of results) {
            assert.equal(response.status, 200);
            assert.match(body, /"koneko-/);
        }
    });

    test('reuses cached sqlite clients across requests for the same directory and database name', async () => {
        await __clearSqliteCache();
        assert.equal(__sqliteCacheSize(), 0);

        await koneko.renderCode('<% await require("sqlite").open("cache").query("SELECT 1 AS n") %>', {
            siteId: 'cache-a',
            siteRoot,
            sqliteDir,
            request: {},
        });
        await koneko.renderCode('<% await require("sqlite").open("cache").query("SELECT 2 AS n") %>', {
            siteId: 'cache-b',
            siteRoot,
            sqliteDir,
            request: {},
        });

        assert.equal(__sqliteCacheSize(), 1);
    });

    test('times out long-running sqlite queries and clears the cached client', async () => {
        await __clearSqliteCache();
        const sqliteBridge = createSqliteBridge(join(siteRoot, 'timeout-dbs'), {
            queryTimeoutMs: 10,
        });
        await assert.rejects(
            () => sqliteBridge(
                'get',
                'slow',
                'WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x < 1000000) SELECT sum(x) FROM cnt',
            ),
            /timed out after 10ms/,
        );
        assert.equal(__sqliteCacheSize(), 0);
    });
});
