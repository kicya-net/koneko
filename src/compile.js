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

        if (ch === '"' || ch === "'" || ch === '`') {
            i = skipString(source, i);
            continue;
        }

        if (ch === '/' && source[i + 1] === '/') {
            i = source.indexOf('\n', i);
            if (i === -1) return -1;
            i++;
            continue;
        }

        if (ch === '/' && source[i + 1] === '*') {
            i = source.indexOf('*/', i + 2);
            if (i === -1) return -1;
            i += 2;
            continue;
        }

        if (ch === '%' && source[i + 1] === '>') return i;
        i++;
    }
    return -1;
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

export function compile(source) {
    let out = '(async () => {\n';
    out += 'const __k = [];\n';
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
            out += `__k.push(escapeHtml(${inner.slice(1).trim()}));\n`;
        } else if (inner[0] === '-') {
            // <%- expr %> - raw output
            out += `__k.push(${inner.slice(1).trim()});\n`;
          } else {
            // <% code %>
            out += inner.trim() + '\n';
        }
        i = tagEnd + 2;
    }
    out += 'return __k.join("");\n})()';
    return out;
}