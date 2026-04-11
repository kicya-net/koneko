/*
Copyright 2026 Kicya

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import express from 'ultimate-express';
import './logs.js';
import { Koneko } from '../koneko.js';
import fileUpload from 'express-fileupload';

const app = express();
const koneko = new Koneko({
    isolateCount: process.env.ISOLATES_PER_PROCESS ? Number(process.env.ISOLATES_PER_PROCESS) : 10,
    memoryLimit: process.env.ISOLATES_MEMORY_LIMIT_MB ? Number(process.env.ISOLATES_MEMORY_LIMIT_MB) : 64,
});
const SECRET = process.env.KONEKO_SECRET;
const MAX_FILE_SIZE_MB = process.env.MAX_FILE_SIZE_MB ? Number(process.env.MAX_FILE_SIZE_MB) : 20;

app.use(express.json({ limit: MAX_FILE_SIZE_MB * 1024 * 1024 }));
app.use(express.urlencoded({ extended: false, limit: MAX_FILE_SIZE_MB * 1024 * 1024 }));
app.use(fileUpload({
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
    abortOnLimit: true,
    limitHandler: (req, res, next) => {
        return res.status(413).send(generateError(413, 'File too large'));
    }
}));


function generateError(status, message) {
    return `<!DOCTYPE html><html><body><h1>Error ${status}</h1><p>${message}</p><hr><i>Koneko</i></body></html>`;
}

app.use(async (req, res) => {
    if(SECRET && req.get('X-Koneko-Secret') !== SECRET) return res.status(401).send(generateError(401, 'Unauthorized'));

    const siteId = req.get('X-Koneko-Site-Id') ?? req.hostname;
    const siteRoot = req.get('X-Koneko-Site-Root');
    const filePath = req.get('X-Koneko-File-Path') ?? req.path;
    const request = req;

    if(!siteId) return res.status(500).send(generateError(500, 'Site ID not set'));
    if(!siteRoot) return res.status(500).send(generateError(500, 'Site root not set'));
    if(!filePath) return res.status(500).send(generateError(500, 'File path not set'));
    
    try {
        const body = await koneko.renderFile(filePath, { siteId, siteRoot, request });
        for(const name in body.response.headers) {
            res.set(name, body.response.headers[name]);
        }
        res.status(body.response.status);
        res.send(body.body);
    } catch (err) {
        console.error(err);
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