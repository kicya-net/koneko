import path from 'node:path';
import fs from 'node:fs';

const REQUIRE_CODE = fs.readFileSync(new URL('./sandbox/require.js', import.meta.url), 'utf-8');

export default async function buildRequireApi(siteWorker) {
    function resolveModule(filePath) {
        const fullFilePath = path.join(siteWorker.siteRoot, filePath);
        if(!fullFilePath.startsWith(siteWorker.siteRoot + path.sep)) {
            throw new Error('Invalid file path');
        }
        const stat = fs.statSync(fullFilePath);
        if(!stat.isFile()) {
            throw new Error('Not a file: ' + filePath);
        }
        return fullFilePath;
    }
    async function getModule(filePath) {
        const fullFilePath = resolveModule(filePath);
        const code = await fs.promises.readFile(fullFilePath, 'utf-8');
        return code;
    }
    await siteWorker.context.evalClosure(`
        ${REQUIRE_CODE}
    `, [
        getModule,
    ], {
        arguments: { reference: true },
    });
}