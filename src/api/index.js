import { buildApi } from './utils.js';
import buildConsoleApi from './console.js';
import buildNetApi from './net.js';

export async function createApis(siteWorker) {
    await buildNetApi(siteWorker);
    await siteWorker.context.evalClosure(...buildApi(buildConsoleApi(siteWorker)), { arguments: { reference: true } });
}