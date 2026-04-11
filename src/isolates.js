import ivm from 'isolated-vm';
import { EventEmitter } from 'tseep';

let id = 0;

export class PooledIsolate extends EventEmitter {
    constructor(memoryLimit) {
        super();
        this.i = new ivm.Isolate({
            memoryLimit: memoryLimit,
            onCatastrophicError: (error) => this.emit('catastrophicError', error),
        });
        this.id = id++;
        this.busy = false;
    }
    dispose() {
        if(!this.i.isDisposed) {
            this.i.dispose();
        }
        this.emit('dispose');
        this.removeAllListeners();
    }
}

export class IsolatePool {
    constructor(isolateCount, memoryLimit) {
        this.isolates = [];
        this.queue = [];
        this.isolateCount = isolateCount;
        this.memoryLimit = memoryLimit;

        this.init();
    }

    init() {
        for (let i = 0; i < this.isolateCount; i++) {
            this.createIsolate();
        }
        setInterval(() => {
            for(const isolate of this.isolates) {
                if(isolate.i.isDisposed) {
                    isolate.dispose();
                }
            }
        }, 1000).unref();
    }

    createIsolate() {
        if (this.isolates.length >= this.isolateCount) {
            throw new Error('Isolate pool is full');
        }
        const isolate = new PooledIsolate(this.memoryLimit);
        isolate.on('catastrophicError', () => {
            isolate.dispose();
            isolate.busy = true;
        });
        isolate.on('dispose', () => {
            this.isolates.splice(this.isolates.findIndex(p => p.id === isolate.id), 1);
            this.createIsolate();
        });
        this.isolates.push(isolate);
        return isolate;
    }

    acquire(timeout = 5000) {
        const free = this.isolates.find(p => !p.busy && !p.i.isDisposed);
        if (free) {
            free.busy = true;
            return Promise.resolve(free);
        }
    
        return new Promise((resolve, reject) => {
            const entry = {
                resolve,
                timer: setTimeout(() => {
                    const idx = this.queue.indexOf(entry);
                    if (idx !== -1) this.queue.splice(idx, 1);
                    reject(new Error('No available isolates'));
                }, timeout),
            };
            this.queue.push(entry);
        });
    }
    
    release(isolate) {
        isolate.busy = false;
    
        while (this.queue.length > 0) {
            const entry = this.queue.shift();
            clearTimeout(entry.timer);
    
            const free = this.isolates.find(p => !p.busy && !p.i.isDisposed);
            if (free) {
                free.busy = true;
                entry.resolve(free);
                return;
            }
        }
    }
}
