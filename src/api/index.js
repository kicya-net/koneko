import { buildApi } from './utils.js';
import buildConsoleApi from './console.js';
import buildNetApi from './net.js';
import buildRequireApi from './require.js';

export async function createApis(siteWorker) {
    if(siteWorker.isolate.i.isDisposed) return;
    await buildRequireApi(siteWorker);
    await buildNetApi(siteWorker);
    await siteWorker.context.evalClosure(...buildApi(buildConsoleApi(siteWorker)), { arguments: { reference: true } });
}