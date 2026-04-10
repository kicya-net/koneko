import express from 'ultimate-express';
import './logs.js';
import { Koneko } from '../koneko.js';

const app = express();
const koneko = new Koneko({
    isolateCount: process.env.ISOLATES_PER_PROCESS ? Number(process.env.ISOLATES_PER_PROCESS) : 10,
    memoryLimit: process.env.ISOLATES_MEMORY_LIMIT_MB ? Number(process.env.ISOLATES_MEMORY_LIMIT_MB) : 64,
});
const SECRET = process.env.KONEKO_SECRET;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function generateError(status, message) {
    return `<!DOCTYPE html><html><body><h1>Error ${status}</h1><p>${message}</p><hr><i>Koneko</i></body></html>`;
}

app.use(async (req, res) => {
    if(SECRET && req.get('X-Koneko-Secret') !== SECRET) return res.status(401).send(generateError(401, 'Unauthorized'));

    const siteId = req.get('X-Koneko-Site-Id') ?? req.hostname;
    const siteRoot = req.get('X-Koneko-Site-Root');
    const filePath = req.get('X-Koneko-File-Path');
    const request = req;

    if(!siteId) return res.status(500).send(generateError(500, 'Site ID not set'));
    if(!siteRoot) return res.status(500).send(generateError(500, 'Site root not set'));
    if(!filePath) return res.status(500).send(generateError(500, 'File path not set'));
    
    try {
        const body = await koneko.renderFile(filePath, { siteId, siteRoot, request });
        for(const [key, value] of body.response.headers) {
            res.set(key, value);
        }
        res.status(body.response.status);
        res.send(body.body);
    } catch (err) {
        return res.status(500).send(generateError(500, err.message));
    }
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send(generateError(500, 'Internal server error'));
});

const listenTarget = process.env.SOCK_PATH ?? Number(process.env.PORT);

app.listen(listenTarget, () => {
    console.log(`Server is running on ${listenTarget}`);
});