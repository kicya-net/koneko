#!/usr/bin/env node
import 'dotenv/config';
import express from 'ultimate-express';
import { konekoMiddleware } from './middleware.js';
import { generateError } from './utils.js';
import args from 'args';
import cluster from 'node:cluster';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

args
    .option('port', 'The port to run the server on', process.env.PORT ? Number(process.env.PORT) : 3000)
    .option('sock', 'The path to the socket file', process.env.SOCK_PATH)
    .option('threads', 'The number of worker threads to run', process.env.NUM_THREADS ? Number(process.env.NUM_THREADS) : Math.min(4, os.cpus().length))
    .option('isolates', 'The number of isolates to run', process.env.ISOLATES_PER_THREAD ? Number(process.env.ISOLATES_PER_THREAD) : 40)
    .option('clean', 'Render files without .cat extension', process.env.CLEAN ? Boolean(process.env.CLEAN) : false)
    .option('file-size', 'The maximum file size to accept in MB', process.env.MAX_FILE_SIZE_MB ? Number(process.env.MAX_FILE_SIZE_MB) : 20)
    .option('public', 'Public directory to serve', process.env.PUBLIC_DIR ?? 'public')
    .option('sqlite-dir', 'Folder containing SQLite databases')
    .option('memory', 'The memory limit for each isolate in MB', process.env.ISOLATE_MEMORY_LIMIT_MB ? Number(process.env.ISOLATE_MEMORY_LIMIT_MB) : 64)
    .option('cpu-timeout', 'The CPU timeout for each isolate in milliseconds', process.env.ISOLATE_CPU_TIMEOUT ? Number(process.env.ISOLATE_CPU_TIMEOUT) : 25)
    .option('wall-timeout', 'The wall timeout for each isolate in milliseconds', process.env.ISOLATE_WALL_TIMEOUT ? Number(process.env.ISOLATE_WALL_TIMEOUT) : 5000)
    .command('serve', 'Serve a project', serve)
    .example('koneko serve .', 'Serve the current project using ./public')
    .example('koneko serve . --public www', 'Serve the current project using ./www')

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
        console.log(`Serving ${fullSiteRoot} at ${options.sock ?? options.port}`);
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
    app.use((err, req, res, next) => {
        res.status(500).send(generateError(500, err?.stack ?? String(err)));
    });
    app.use((req, res, next) => {
        res.status(404).send(generateError(404, 'Not found'));
    });
    app.listen(options.sock ?? options.port);
}

if(!process.argv.find(arg => arg === 'serve' || arg === 'help' || arg === '--help' || arg === '-h')) {
    console.error('No command provided. Use --help to see available commands.');
    process.exit(1);
}

args.parse(process.argv, {
    version: false,
});