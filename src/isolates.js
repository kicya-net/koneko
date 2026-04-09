import ivm from 'isolated-vm';
import { EventEmitter } from 'tseep';

let id = 0;

export class PooledIsolate extends EventEmitter {
    constructor() {
        super();
        this.isolate = new ivm.Isolate({
            memoryLimit: this.memoryLimit,
            onCatastrophicError: (error) => this.emit('catastrophicError', error),
        });
        this.id = id++;
        this.busy = false;
    }

    get isDisposed() {
        return this.isolate.isDisposed;
    }

    createContext() {
        return this.isolate.createContext(...arguments);
    }

    dispose() {
        return this.isolate.dispose();
    }
}

export class IsolatePool extends EventEmitter {
    constructor(isolateCount, memoryLimit) {
        super();
        this.isolates = [];
        this.isolateCount = isolateCount;
        this.memoryLimit = memoryLimit;

        this.init();
    }

    init() {
        for (let i = 0; i < this.isolateCount; i++) {
            this.createIsolate();
        }
    }

    createIsolate() {
        if (this.isolates.length >= this.isolateCount) {
            throw new Error('Isolate pool is full');
        }
        const isolate = new PooledIsolate();
        isolate.on('catastrophicError', () => {
            try {
                isolate.isolate.dispose();
            } catch {
                /* already disposed */
            }
            isolate.busy = true;
            this.isolates = this.isolates.filter((p) => p.id !== isolate.id);
            isolate.removeAllListeners();
            this.createIsolate();
        });
        this.isolates.push(isolate);
        return isolate;
    }

    async acquire(timeout = 5000) {
        const free = this.isolates.find((p) => !p.busy && !p.isDisposed);
        if (free) {
            free.busy = true;
            return free;
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.removeListener('release', onRelease);
                reject(new Error('No isolates available'));
            }, timeout);

            const onRelease = () => {
                const found = this.isolates.find((p) => !p.busy && !p.isDisposed);
                if (!found) return;
                found.busy = true;
                clearTimeout(timer);
                this.removeListener('release', onRelease);
                resolve(found);
            };

            this.on('release', onRelease);
        });
    }
    release(pooled) {
        pooled.busy = false;
        this.emit('release', pooled);
    }
}
