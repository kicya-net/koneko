import fs from 'node:fs';
import path from 'node:path';
import { safeFetch } from './net.js';

const SANDBOX_CODE = [
    fs.readFileSync(new URL('./sandbox/headers.js', import.meta.url), 'utf-8'),
    fs.readFileSync(new URL('./sandbox/response.js', import.meta.url), 'utf-8'),
    fs.readFileSync(new URL('./sandbox/path.js', import.meta.url), 'utf-8'),
    fs.readFileSync(new URL('./sandbox/bootstrap.js', import.meta.url), 'utf-8'),
].join('\n');

export async function createApis(siteWorker) {
    if(siteWorker.isolate.i.isDisposed) return;

    async function getModule(filePath) {
        const fullFilePath = path.join(siteWorker.siteRoot, filePath);
        if(!fullFilePath.startsWith(siteWorker.siteRoot + path.sep)) {
            throw new Error('Invalid file path');
        }
        const stat = fs.statSync(fullFilePath);
        if(!stat.isFile()) {
            throw new Error('Not a file: ' + filePath);
        }
        return await fs.promises.readFile(fullFilePath, 'utf-8');
    }

    await siteWorker.context.evalClosure(SANDBOX_CODE, [
        getModule,
        async (url, options) => safeFetch(url, options),
    ], {
        arguments: { reference: true },
    });
}