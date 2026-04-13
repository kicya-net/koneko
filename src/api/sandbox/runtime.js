const responseStack = [];

function getCurrentResponse() {
    return responseStack.length ? responseStack[responseStack.length - 1] : null;
}

async function withResponse(response, fn) {
    responseStack.push(response);
    try {
        return await fn();
    } finally {
        responseStack.pop();
    }
}
