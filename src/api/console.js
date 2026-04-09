export default function buildConsoleApi(siteWorker) {
    return {
        'console': {
            log: {
                args: '...args',
                handler: (...args) => console.log(siteWorker.siteId, ...args),
            },
            error: {
                args: '...args',
                handler: (...args) => console.error(siteWorker.siteId, ...args),
            },
            warn: {
                args: '...args',
                handler: (...args) => console.warn(siteWorker.siteId, ...args),
            },
        }
    };
}