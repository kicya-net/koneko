import 'dotenv/config';
import express from 'ultimate-express';
import { konekoMiddleware } from './middleware.js';
import args from 'args';
import cluster from 'node:cluster';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

args
    .option('port', 'The port to run the server on', process.env.PORT ? Number(process.env.PORT) : 3000)
    .option('sock', 'The path to the socket file', process.env.SOCK_PATH)
    .option('processes', 'The number of worker processes to run', process.env.NUM_PROCESSES ? Number(process.env.NUM_PROCESSES) : Math.min(4, os.cpus().length))
    .option('isolates', 'The number of isolates to run', process.env.ISOLATES_PER_PROCESS ? Number(process.env.ISOLATES_PER_PROCESS) : 40)
    .option('clean', 'Render files without .cat extension', process.env.CLEAN ? Boolean(process.env.CLEAN) : false)
    .option('file-size', 'The maximum file size to accept in MB', process.env.MAX_FILE_SIZE_MB ? Number(process.env.MAX_FILE_SIZE_MB) : 20)
    .option('memory', 'The memory limit for each isolate in MB', process.env.ISOLATE_MEMORY_LIMIT_MB ? Number(process.env.ISOLATE_MEMORY_LIMIT_MB) : 64)
    .option('cpu-timeout', 'The CPU timeout for each isolate in milliseconds', process.env.ISOLATE_CPU_TIMEOUT ? Number(process.env.ISOLATE_CPU_TIMEOUT) : 25)
    .option('wall-timeout', 'The wall timeout for each isolate in milliseconds', process.env.ISOLATE_WALL_TIMEOUT ? Number(process.env.ISOLATE_WALL_TIMEOUT) : 5000)
    .command('serve', 'Serve a folder', serve)
    .example('koneko serve ./public', 'Serve a folder')

async function serve(name, sub, options) {
    const siteRoot = sub[0];
    if(!siteRoot) {
        console.error('A folder is required. Example: koneko serve /path/to/files');
        process.exit(1);
    }

    if (options.processes < 1) {
        console.error('The --processes value must be at least 1');
        process.exit(1);
    }

    const fullSiteRoot = path.resolve(siteRoot);

    if (cluster.isPrimary) {
        if (options.sock) {
            try { fs.unlinkSync(options.sock) } catch (err) { if (err.code !== 'ENOENT') throw err; }
        }

        for (let i = 0; i < options.processes; i++) {
            await new Promise(resolve => setTimeout(resolve, 100)); // weird fix for socket listening
            cluster.fork();
        }

        cluster.on('exit', (worker) => {
            console.log(`Worker ${worker.process.pid} died, restarting`);
            cluster.fork();
        });
        console.log(`Serving ${fullSiteRoot} at ${options.sock ?? options.port}`);
        console.log(`- Processes: ${options.processes}`);
        console.log(`- Isolate count: ${options.isolates}`);
        console.log(`- Memory limit: ${options.memory} MB`);
        console.log(`- CPU timeout: ${options.cpuTimeout} ms`);
        console.log(`- Wall timeout: ${options.wallTimeout} ms`);
        console.log(`- Max file size: ${options.fileSize} MB`);
        console.log(`- Clean: ${options.clean}`);
        return;
    }

    const app = express();
    app.use(konekoMiddleware({
        siteRoot: fullSiteRoot,
        clean: options.clean,
        konekoOptions: {
            isolateCount: options.isolates,
            memoryLimit: options.memory,
            cpuTimeout: options.cpuTimeout,
            wallTimeout: options.wallTimeout,
        },
    }));
    app.listen(options.sock ?? options.port);
}

args.parse(process.argv, {
    version: false,
});