import express from 'ultimate-express';
import './logs.js';
import { Koneko } from './koneko.js';

const app = express();
const koneko = new Koneko({
    isolateCount: process.env.ISOLATES_PER_PROCESS ? Number(process.env.ISOLATES_PER_PROCESS) : 10,
    memoryLimit: process.env.ISOLATES_MEMORY_LIMIT_MB ? Number(process.env.ISOLATES_MEMORY_LIMIT_MB) : 64,
});
const worker = await koneko.acquireSite('123', '/path/to/site');
console.log(worker);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Hello World');
});

const listenTarget = process.env.SOCK_PATH ?? Number(process.env.PORT);

app.listen(listenTarget, () => {
    console.log(`Server is running on ${listenTarget}`);
});