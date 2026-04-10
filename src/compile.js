import fs from 'fs/promises';

const SANDBOX_HEADERS_CLASS = await fs.readFile(new URL('./api/sandbox/headers.js', import.meta.url), 'utf-8');

function quote(str) {
    return "'" + str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
    + "'";
}

function findClose(source, from) {
    let i = from;
    while (i < source.length - 1) {
        const ch = source[i];

        // jump over JS strings
        if (ch === '"' || ch === "'" || ch === '`') {
            i = skipString(source, i);
            continue;
        }

        // jump over single-line comments
        if (ch === '/' && source[i + 1] === '/') {
            i = source.indexOf('\n', i);
            if (i === -1) return -1;
            i++;
            continue;
        }

        // jump over multi-line comments
        if (ch === '/' && source[i + 1] === '*') {
            i = source.indexOf('*/', i + 2);
            if (i === -1) return -1;
            i += 2;
            continue;
        }

        // find closing tag
        if (ch === '%' && source[i + 1] === '>') return i;
        i++;
    }
    return -1;
}

function stripLineComments(code) {
    let out = '';
    let i = 0;
    while (i < code.length) {
        const ch = code[i];

        if (ch === '"' || ch === "'" || ch === '`') {
            const start = i;
            i = skipString(code, i);
            out += code.slice(start, i);
            continue;
        }

        if (ch === '/' && code[i + 1] === '/') {
            const nl = code.indexOf('\n', i);
            if (nl === -1) break;
            i = nl; // keep the newline itself
            continue;
        }

        out += ch;
        i++;
    }
    return out;
}

function skipString(source, i) {
    const quote = source[i++];
    while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) return i + 1;
        i++;
    }
    return i;
}

export function compile(source, options = {}) {
    let out = '(async () => {\n';
    out += SANDBOX_HEADERS_CLASS + '\n';

    if (options.request) {
        out += `const __incoming = JSON.parse(${quote(JSON.stringify(options.request))});\n`;
        out += 'const request = { url: __incoming.url, method: __incoming.method, headers: new Headers(__incoming.headers) };\n';
    }

    out += 'const __k = [];\n';
    out += 'const __outHeaders = new Headers();\n';
    out += 'const response = { status: 200, statusText: \'\', get headers() { return __outHeaders; } };\n';
    out += 'function echo(v) { __k.push(v); }\n';
    out += 'function escapeHtml(v) { if(v==null)return""; return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }\n';
    
    let i = 0;
    while(i < source.length) {
        const tagStart = source.indexOf('<%', i);
        if (tagStart === -1) {
            // no more tags
            out += `__k.push(${quote(source.slice(i))});\n`;
            break;
        }
        if (tagStart > i) {
            // HTML before tag
            out += `__k.push(${quote(source.slice(i, tagStart))});\n`;
        }

        // find closing tag
        const tagEnd = findClose(source, tagStart);
        if (tagEnd === -1) {
            throw new Error(`Unclosed <% tag at ${tagStart}`);
        }

        const inner = source.slice(tagStart + 2, tagEnd);
        if(inner[0] === '=') {
            // <%= expr %> - escaped output
            out += `__k.push(escapeHtml(${stripLineComments(inner.slice(1).trim())}));\n`;
        } else if (inner[0] === '-') {
            // <%- expr %> - raw output
            out += `__k.push(${stripLineComments(inner.slice(1).trim())});\n`;
          } else {
            // <% code %>
            out += inner.trim() + '\n';
        }
        i = tagEnd + 2;
    }
    out += 'return { body: __k.join(""), response: { status: response.status, statusText: response.statusText, headers: Object.fromEntries(__outHeaders.entries()) } };\n})()';
    return out;
}