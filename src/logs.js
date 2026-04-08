const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => originalConsoleLog(`[${process.pid}]`, ...args);
console.error = (...args) => originalConsoleError(`[${process.pid}]`, ...args);
console.warn = (...args) => originalConsoleWarn(`[${process.pid}]`, ...args);