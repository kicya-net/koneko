import { IsolatePool } from './isolates.js';

export class Koneko {
    constructor() {
        this.isolatePool = new IsolatePool(process.env.ISOLATES_PER_PROCESS, process.env.ISOLATES_MEMORY_LIMIT_MB);
    }
}