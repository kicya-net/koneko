import 'dotenv/config';
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
    const numWorkers = process.env.NUM_WORKERS || os.cpus().length;
    console.log(`Master cluster setting up ${numWorkers} workers...`);

    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died, restarting`);
        cluster.fork();
    });
} else {
    import('./server.js');
}
