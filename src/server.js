import express from 'ultimate-express';
import './logs.js';
import { KonekoIsolateManager } from './isolates.js';

const app = express();

const isolateManager = new KonekoIsolateManager();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.post('/eval', async (req, res) => {
    const code = req.body.code;
    const result = await isolateManager.eval(code);
    res.json({ result });
});

const listenTarget = process.env.SOCK_PATH ?? Number(process.env.PORT);

app.listen(listenTarget, () => {
    console.log(`Server is running on ${listenTarget}`);
});