globalThis.__requireCounter = (globalThis.__requireCounter ?? 0) + 1;
module.exports = { loaded: globalThis.__requireCounter, marker: 'initial' };
