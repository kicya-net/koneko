import express from 'ultimate-express';
import './logs.js';
import { Koneko } from '../koneko.js';

const app = express();
const koneko = new Koneko({
    isolateCount: process.env.ISOLATES_PER_PROCESS ? Number(process.env.ISOLATES_PER_PROCESS) : 10,
    memoryLimit: process.env.ISOLATES_MEMORY_LIMIT_MB ? Number(process.env.ISOLATES_MEMORY_LIMIT_MB) : 64,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.get("/test", async (req, res) => {
    try {
        const { body, response } = await koneko.renderFile('test/assets/log.cat', {
            siteId: '123',
            siteRoot: '.',
            request: req,
        });
        res.status(response.status);
        for (const [name, value] of Object.entries(response.headers)) {
            res.setHeader(name, value);
        }
        res.send(body);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.stack);
    }
})

const listenTarget = process.env.SOCK_PATH ?? Number(process.env.PORT);

app.listen(listenTarget, () => {
    console.log(`Server is running on ${listenTarget}`);
});