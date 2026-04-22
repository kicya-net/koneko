#!/usr/bin/env node
import 'dotenv/config';
import express from 'ultimate-express';
import { konekoMiddleware } from './middleware.js';
import { Koneko } from '../koneko.js';
import { applyResponseHeaders, buildRequest, generateError, konekoHelpers } from './utils.js';
import args from 'args';
import cluster from 'node:cluster';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

args
    .option('host', 'The host to run the server on')
    .option('port', 'The port to run the server on', process.env.PORT ? Number(process.env.PORT) : 3000)
    .option('sock', 'The path to the socket file', process.env.SOCK_PATH)
    .option('threads', 'The number of worker threads to run', process.env.NUM_THREADS ? Number(process.env.NUM_THREADS) : Math.min(4, os.cpus().length))
    .option('isolates', 'The number of isolates to run', process.env.ISOLATES_PER_THREAD ? Number(process.env.ISOLATES_PER_THREAD) : 40)
    .option('clean', 'Render files without .cat extension', process.env.CLEAN ? Boolean(process.env.CLEAN) : false)
    .option('file-size', 'The maximum file size to accept in MB', process.env.MAX_FILE_SIZE_MB ? Number(process.env.MAX_FILE_SIZE_MB) : 20)
    .option('public', 'Public directory to serve', process.env.PUBLIC_DIR ?? 'public')
    .option('sqlite-dir', 'Folder containing SQLite databases', process.env.SQLITE_DIR)
    .option('memory', 'The memory limit for each isolate in MB', process.env.ISOLATE_MEMORY_LIMIT_MB ? Number(process.env.ISOLATE_MEMORY_LIMIT_MB) : 64)
    .option('cpu-timeout', 'The CPU timeout for each isolate in milliseconds', process.env.ISOLATE_CPU_TIMEOUT ? Number(process.env.ISOLATE_CPU_TIMEOUT) : 25)
    .option('wall-timeout', 'The wall timeout for each isolate in milliseconds', process.env.ISOLATE_WALL_TIMEOUT ? Number(process.env.ISOLATE_WALL_TIMEOUT) : 5000)
    .command('serve', 'Serve a project', serve)
    .command('http', 'Run internal Koneko HTTP server', http)
    .example('koneko serve .', 'Serve the current project using ./public')
    .example('koneko serve . --public www', 'Serve the current project using ./www')
    .example('koneko http --port 3000', 'Run internal Koneko HTTP service');

async function serve(name, sub, options) {
    const siteRoot = sub[0];
    if(!siteRoot) {
        console.error('A project root is required. Example: koneko serve /path/to/project');
        process.exit(1);
    }

    if (options.threads < 1) {
        console.error('The --threads value must be at least 1');
        process.exit(1);
    }

    const fullSiteRoot = path.isAbsolute(siteRoot) ? siteRoot : path.resolve(siteRoot);
    const fullPublicDir = options.public == null ? fullSiteRoot : path.join(fullSiteRoot, options.public);

    if(!fullPublicDir.startsWith(fullSiteRoot) && fullPublicDir !== fullSiteRoot) {
        console.error('The --public value must be inside the project root');
        process.exit(1);
    }

    if (cluster.isPrimary) {
        if (options.sock) {
            try { fs.unlinkSync(options.sock) } catch (err) { if (err.code !== 'ENOENT') throw err; }
        }

        for (let i = 0; i < options.threads; i++) {
            await new Promise(resolve => setTimeout(resolve, 100)); // weird fix for socket listening
            cluster.fork();
        }

        cluster.on('exit', (worker) => {
            console.log(`Worker ${worker.process.pid} died, restarting`);
            cluster.fork();
        });
        const listenTarget = options.sock ?? (options.host ? `${options.host}:${options.port}` : options.port);
        console.log(`Serving ${fullSiteRoot} at ${listenTarget}`);
        console.log(`- Public dir: ${fullPublicDir}`);
        console.log(`- Threads: ${options.threads}`);
        console.log(`- Isolate count per process: ${options.isolates}`);
        console.log(`- Memory limit: ${options.memory} MB`);
        console.log(`- CPU timeout: ${options.cpuTimeout} ms`);
        console.log(`- Wall timeout: ${options.wallTimeout} ms`);
        console.log(`- Max file size: ${options.fileSize} MB`);
        console.log(`- SQLite dir: ${options.sqliteDir ?? '(disabled)'}`);
        console.log(`- Clean: ${options.clean}`);
        return;
    }

    const app = express();
    app.use(konekoMiddleware({
        siteRoot: fullSiteRoot,
        publicDir: fullPublicDir,
        sqliteDir: options.sqliteDir,
        clean: options.clean,
        konekoOptions: {
            isolateCount: options.isolates,
            memoryLimit: options.memory,
            cpuTimeout: options.cpuTimeout,
            wallTimeout: options.wallTimeout,
        },
    }));
    app.use(express.static(fullPublicDir));
    app.use((err, req, res, next) => {
        console.error(err);
        res.status(500).send(generateError(500, err?.stack ?? String(err), err?.debugLogs));
    });
    app.use((req, res, next) => {
        res.status(404).send(generateError(404, 'Not found'));
    });
    if (options.sock) {
        app.listen(options.sock);
    } else if (options.host) {
        app.listen(options.port, options.host);
    } else {
        app.listen(options.port);
    }
}

async function http(name, sub, options) {
    if (options.threads < 1) {
        console.error('The --threads value must be at least 1');
        process.exit(1);
    }

    if (cluster.isPrimary) {
        if (options.sock) {
            try { fs.unlinkSync(options.sock) } catch (err) { if (err.code !== 'ENOENT') throw err; }
        }

        for (let i = 0; i < options.threads; i++) {
            await new Promise(resolve => setTimeout(resolve, 100)); // weird fix for socket listening
            cluster.fork();
        }

        cluster.on('exit', async (worker) => {
            await new Promise(resolve => setTimeout(resolve, 200));
            console.log(`Worker ${worker.process.pid} died, restarting`);
            cluster.fork();
        });

        const listenTarget = options.sock ?? (options.host ? `${options.host}:${options.port}` : options.port);
        console.log(`Running internal HTTP server at ${listenTarget}`);
        console.log(`- Threads: ${options.threads}`);
        console.log(`- Isolate count per process: ${options.isolates}`);
        console.log(`- Memory limit: ${options.memory} MB`);
        console.log(`- Max file size: ${options.fileSize} MB`);
        return;
    }

    await import('./logs.js');

    const app = express();
    const koneko = new Koneko({
        isolateCount: options.isolates,
        memoryLimit: options.memory,
    });
    const secret = process.env.KONEKO_SECRET;
    const maxFileSizeBytes = options.fileSize * 1024 * 1024;

    app.use(konekoHelpers(maxFileSizeBytes));

    app.use(async (req, res) => {
        if (secret && req.get('X-Koneko-Secret') !== secret) {
            return res.status(401).send(generateError(401, 'Unauthorized'));
        }

        const siteId = req.get('X-Koneko-Site-Id') ?? req.hostname;
        const siteRoot = req.get('X-Koneko-Site-Root');
        const sqliteDir = req.get('X-Koneko-Sqlite-Dir') ?? null;
        const filePath = req.get('X-Koneko-File-Path') ?? req.path;
        const request = buildRequest(req);

        if (!siteId) return res.status(500).send(generateError(500, 'Site ID not set'));
        if (!siteRoot) return res.status(500).send(generateError(500, 'Site root not set'));
        if (!filePath) return res.status(500).send(generateError(500, 'File path not set'));

        try {
            const body = await koneko.renderFile(filePath, { siteId, siteRoot, sqliteDir, request });
            applyResponseHeaders(res, body.response.headers);
            res.status(body.response.status);
            res.send(body.body);
        } catch (err) {
            console.error(err);
            return res.status(500).send(generateError(500, err.stack));
        }
    });

    app.use((err, req, res, next) => {
        console.error(err);
        res.status(500).send(generateError(500, err?.stack ?? String(err), err?.debugLogs));
    });

    if (options.sock) {
        app.listen(options.sock, () => {
            console.log(`Server is running on ${options.sock}`);
        });
    } else {
        const onListen = () => {
            console.log(options.host ? `Server is running on ${options.host}:${options.port}` : `Server is running on ${options.port}`);
        };
        if (options.host) {
            app.listen(options.port, options.host, onListen);
        } else {
            app.listen(options.port, onListen);
        }
    }
}

if(!process.argv.find(arg => arg === 'serve' || arg === 'http' || arg === 'help' || arg === '--help' || arg === '-h')) {
    console.error('No command provided. Use --help to see available commands.');
    process.exit(1);
}

args.parse(process.argv, {
    version: false,
});