import express from 'ultimate-express';
import './logs.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Hello World');
});

const listenTarget = process.env.SOCK_PATH ?? Number(process.env.PORT);

app.listen(listenTarget, () => {
    console.log(`Server is running on ${listenTarget}`);
});