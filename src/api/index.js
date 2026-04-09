import { buildApi } from './utils.js';
import consoleDefinitions from './console.js';

export async function createApis(context) {
    await context.evalClosure(...buildApi(consoleDefinitions), { arguments: { reference: true } });
}