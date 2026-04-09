import { buildApi } from './utils.js';
import buildConsoleApi from './console.js';

export async function createApis(siteWorker) {
    await siteWorker.context.evalClosure(...buildApi(buildConsoleApi(siteWorker)), { arguments: { reference: true } });
}