import { KonekoIsolateManager } from './isolates.js';

export class Koneko {
    constructor() {
        this.isolateManager = new KonekoIsolateManager();
    }
}