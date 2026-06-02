const { bcryptInvoke } = require('__internals');

const bcrypt = {
    hash(data) {
        return bcryptInvoke('hash', String(data));
    },
    compare(data, hash) {
        return bcryptInvoke('compare', String(data), String(hash));
    },
};

module.exports = Object.freeze(bcrypt);
