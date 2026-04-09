import ivm from 'isolated-vm';
import EventEmitter from 'events';

let id = 0;

export class KonekoIsolate extends EventEmitter {
    constructor() {
        super();
        this.id = id++;
        this.isolate = new ivm.Isolate({
            memoryLimit: process.env.ISOLATES_MEMORY_LIMIT_MB ? Number(process.env.ISOLATES_MEMORY_LIMIT_MB) : 64,
            onCatastrophicError: (error) => {
                console.error(`Isolate ${this.id} crashed: ${error}`);
                this.isolate.dispose();
                this.isolate = null;
                this.busy = false;
                this.emit('crash');
            },
        });
        this.busy = false;
        this.context = null;
    }

    async init() {
        if(!this.isolate) throw new Error('Isolate is not initialized');
        if(this.context) {
            this.context.dispose();
            this.context = null;
        }
        this.context = this.isolate.createContextSync();
    }

    async eval(code) {
        if(!this.isolate) throw new Error('Isolate is not initialized');
        if(!this.context) throw new Error('Context is not initialized');
        if (this.busy) throw new Error('Isolate is busy');

        this.busy = true;
        try {
            const result = this.context.evalClosureSync(code);
            return result;
        } catch (error) {
            throw error;
        } finally {
            this.busy = false;
        }
    }
}

export class KonekoIsolateManager {
    constructor() {
        this.isolates = [];

        for (let i = 0; i < process.env.ISOLATES_PER_WORKER; i++) {
            this.createIsolate();
        }
    }

    async createIsolate() {
        const isolate = new KonekoIsolate();
        this.isolates.push(isolate);
        isolate.on('crash', () => {
            this.isolates = this.isolates.filter(i => i.id !== isolate.id);
            this.createIsolate();
        });
        return isolate;
    }

    async getIsolate() {
        const isolate = this.isolates.find(i => !i.busy);
        if(!isolate) {
            throw new Error('No available isolates');
        }
        return isolate;
    }
}