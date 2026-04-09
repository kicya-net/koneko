import ivm from 'isolated-vm';
import { EventEmitter } from 'tseep';

let id = 0;
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
        const isolate = new ivm.Isolate({
            memoryLimit: this.memoryLimit,
            onCatastrophicError: (error) => {
                console.error(`Isolate ${isolate._id} crashed: ${error}`);
                isolate.dispose();
                isolate._busy = true;
                this.isolates = this.isolates.filter(i => i._id !== isolate._id);
                this.createIsolate();
            },
        });
        isolate._id = id++;
        isolate._busy = false;
        this.isolates.push(isolate);
        return isolate;
    }

    async acquire(timeout = 5000) {
        const free = this.isolates.find(i => !i._busy && !i.isDisposed);
        if (free) {
            free._busy = true;
            return free;
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.removeListener('release', onRelease);
                reject(new Error('No isolates available'));
            }, timeout);

            const onRelease = () => {
                const free = this.isolates.find(i => !i._busy && !i.isDisposed);
                if (!free) return;
                free._busy = true;
                clearTimeout(timer);
                this.removeListener('release', onRelease);
                resolve(free);
            };

            this.on('release', onRelease);
        });
    }
    release(isolate) {
        isolate._busy = false;
        this.emit('release', isolate);
    }
}