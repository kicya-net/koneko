import { buildApi } from './utils.js';

export async function createApis(context) {
    const definitions = {
        'console': {
            wa: {
                args: '...args',
                handler: (...args) => console.log(...args),
            },
        },
    };

    await context.evalClosure(
        ...buildApi(definitions),
        { arguments: { reference: true } }
    );
}