import 'dotenv/config';
import cluster from 'cluster';
import fs from 'fs';
import os from 'os';

if(!process.env.PORT && !process.env.SOCK_PATH) {
    console.error('PORT or SOCK_PATH must be set');
    process.exit(1);
}

if (cluster.isPrimary) {
    if (process.env.SOCK_PATH) {
        try { fs.unlinkSync(process.env.SOCK_PATH) } catch (err) { if (err.code !== 'ENOENT') throw err; };
    }

    const numWorkers = process.env.NUM_PROCESSES || os.cpus().length;
    console.log(`Master cluster setting up ${numWorkers} workers...`);

    for (let i = 0; i < numWorkers; i++) {
        await new Promise(resolve => setTimeout(resolve, 100)); // weird fix for socket listening
        cluster.fork();
    }

    cluster.on('exit', async (worker) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(`Worker ${worker.process.pid} died, restarting`);
        cluster.fork();
    });
} else {
    import('./server.js');
}
