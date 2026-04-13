const { sqliteInvoke } = require('__internals');
const handles = new Map();

const sqlite = {
    open(name) {
        name = String(name);
        const cachedHandle = handles.get(name);
        if(cachedHandle) {
            return cachedHandle;
        }
        const handle = Object.freeze({
            async get(sql, params) {
                return await sqliteInvoke('get', name, String(sql), params == null ? null : params);
            },
            async all(sql, params) {
                return await sqliteInvoke('all', name, String(sql), params == null ? null : params);
            },
            async run(sql, params) {
                return await sqliteInvoke('run', name, String(sql), params == null ? null : params);
            },
            async query(sql, params) {
                return await sqliteInvoke('query', name, String(sql), params == null ? null : params);
            },
            async exec(sql, params) {
                return await sqliteInvoke('exec', name, String(sql), params == null ? null : params);
            },
        });
        handles.set(name, handle);
        return handle;
    },
};

module.exports = Object.freeze(sqlite);
