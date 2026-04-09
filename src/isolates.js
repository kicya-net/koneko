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
        this.i.dispose();
        this.emit('dispose');
        this.removeAllListeners();
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
        const isolate = new PooledIsolate(this.memoryLimit);
        isolate.on('catastrophicError', () => {
            try {
                isolate.dispose();
            } catch {
                /* already disposed */
            }
            isolate.busy = true;
        });
        isolate.on('dispose', () => {
            this.isolates = this.isolates.filter((p) => p.id !== isolate.id);
            this.createIsolate();
        });
        this.isolates.push(isolate);
        return isolate;
    }

    acquire(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const free = this.isolates.find((p) => !p.busy && !p.i.isDisposed);
            if (free) {
                free.busy = true;
                resolve(free);
                return;
            }
            const timer = setTimeout(() => {
                this.removeListener('release', onRelease);
                reject(new Error('No available isolates'));
            }, timeout);

            const onRelease = () => {
                const found = this.isolates.find((p) => !p.busy && !p.i.isDisposed);
                if (!found) return;
                found.busy = true;
                clearTimeout(timer);
                this.removeListener('release', onRelease);
                resolve(found);
            };

            this.on('release', onRelease);
        });
    }
    release(isolate) {
        isolate.busy = false;
        this.emit('release', isolate);
    }
}
