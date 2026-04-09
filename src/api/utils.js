export function buildApi(definitions) {
    const hostFns = [];
    let bootstrapCode = `function __n(name, fn) {
        Object.defineProperty(fn, 'name', { value: name });
        Object.defineProperty(fn, 'toString', {
            value: () => 'function ' + name + '() { [native code] }'
        });
        return fn;
    }\n`;

    for (const [key, def] of Object.entries(definitions)) {
        // Top-level function
        if (def.handler) {
            const idx = hostFns.length;
            hostFns.push(def.handler);

            if (def.sync) {
                bootstrapCode += `globalThis.${key} = __n('${key}', function(${def.args || ''}) {
                    return $${idx}.applySync(undefined, [${def.args || ''}], {
                        arguments: { copy: true },
                        result: { copy: true }
                    });
                });\n`;
            } else {
                bootstrapCode += `globalThis.${key} = __n('${key}', async function(${def.args || ''}) {
                    return $${idx}.apply(undefined, [${def.args || ''}], {
                        arguments: { copy: true },
                        result: { promise: true, copy: true }
                    });
                });\n`;
            }
            continue;
        }

        // Namespace with methods
        bootstrapCode += `globalThis.${key} = {};\n`;
        for (const [method, methodDef] of Object.entries(def)) {
            const idx = hostFns.length;
            hostFns.push(methodDef.handler);
            const fullName = `${key}.${method}`;

            if (methodDef.sync) {
                bootstrapCode += `globalThis.${fullName} = __n('${method}', function(${methodDef.args || ''}) {
                    return $${idx}.applySync(undefined, [${methodDef.args || ''}], {
                        arguments: { copy: true },
                        result: { copy: true }
                    });
                });\n`;
            } else {
                bootstrapCode += `globalThis.${fullName} = __n('${method}', async function(${methodDef.args || ''}) {
                    return $${idx}.apply(undefined, [${methodDef.args || ''}], {
                        arguments: { copy: true },
                        result: { promise: true, copy: true }
                    });
                });\n`;
            }
        }
        bootstrapCode += `Object.freeze(globalThis.${key});\n`;
    }

    bootstrapCode += `delete globalThis.__n;\n`;
    return [bootstrapCode, hostFns];
}