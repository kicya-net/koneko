# Koneko

Server-side HTML pre-processor for multi-tenant web hosting.

## TODO

- [ ] Query, cookies
- [ ] File upload handling
- [ ] Set-Cookie sanitization
- [ ] Database API
- [ ] FS API
- [ ] Proper error handling
- [ ] Tests
- - [ ] Request
- - [ ] Response
- [ ] Documentation

## CLI

Help:
```bash
node src/http/cli.js help
```
Serve a folder:
```bash
node src/http/cli.js serve ./public --clean --isolates 40 --memory 64 --cpu-timeout 25 --wall-timeout 5000 --file-size 20
```

## .env

- HOST: The host to run the server on.
- PORT: The port to run the server on.
- SOCK_PATH: The path to the socket file. If set, the server will listen on the socket file instead of the port.
- NUM_PROCESSES: The number of processes to run. By default, it will use the number of CPU cores.
- ISOLATES_PER_PROCESS: The number of isolates to run per process. By default, it will create 10 isolates per process.
- HTTPS_PROXY: The HTTP(S) proxy to use for `fetch` requests.
- KONEKO_SECRET: The secret to use for the Koneko API. If set, the server will require the `X-Koneko-Secret` header to be set.
- MAX_FILE_SIZE_MB: The maximum file size to accept in MB. By default, it will accept 20MB.

## License

Koneko is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details. Copyright (c) 2026 Kicya.