/*
Copyright 2026 Kicya

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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
        this._disposed = false;
    }
    dispose() {
        if(this._disposed) return;
        this._disposed = true;
        if(!this.i.isDisposed) {
            this.i.dispose();
        }
        this.emit('dispose');
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
        if (this.isolates.length >= this.isolateCount) return;
        const isolate = new PooledIsolate(this.memoryLimit);
        isolate.on('catastrophicError', () => {
            isolate.dispose();
            isolate.busy = true;
        });
        isolate.on('dispose', () => {
            const index = this.isolates.findIndex(p => p.id === isolate.id);
            if (index !== -1) {
                this.isolates.splice(index, 1);
            }
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
                    const free = this.isolates.find(p => !p.busy && !p.i.isDisposed);
                    if (free) {
                        free.busy = true;
                        entry.resolve(free);
                        return;
                    }
                    reject(new Error('No available isolates'));
                }, timeout),
            };
            this.queue.push(entry);
        });
    }
    
    release(isolate) {
        if(!isolate.busy) return;
        isolate.busy = false;
    
        if (this.queue.length > 0 && !isolate.i.isDisposed) {
            const entry = this.queue.shift();
            clearTimeout(entry.timer);
            isolate.busy = true;
            entry.resolve(isolate);
        }
    }
}
