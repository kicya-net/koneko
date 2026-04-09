const definitions = {
    'console': {
        log: {
            args: '...args',
            handler: (...args) => console.log(...args),
        },
        error: {
            args: '...args',
            handler: (...args) => console.error(...args),
        },
        warn: {
            args: '...args',
            handler: (...args) => console.warn(...args),
        },
    },
}

export default definitions;