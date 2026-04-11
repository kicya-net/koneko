# Koneko

Server-side HTML pre-processor for multi-tenant web hosting.

## TODO

- [ ] Request body parsing
- [ ] Query, cookies
- [ ] File upload handling
- [ ] Set-Cookie sanitization
- [ ] Database API
- [ ] FS API
- [ ] Proper error handling
- [ ] Tests
- - [ ] Request
- - [ ] Response
- [ ] Serve CLI
- [ ] Express middleware
- [ ] Documentation

## .env

- PORT: The port to run the server on.
- SOCK_PATH: The path to the socket file. If set, the server will listen on the socket file instead of the port.
- NUM_PROCESSES: The number of processes to run. By default, it will use the number of CPU cores.
- ISOLATES_PER_PROCESS: The number of isolates to run per process. By default, it will create 10 isolates per process.
- HTTPS_PROXY: The HTTP(S) proxy to use for `fetch` requests.
- KONEKO_SECRET: The secret to use for the Koneko API. If set, the server will require the `X-Koneko-Secret` header to be set.
- MAX_FILE_SIZE_MB: The maximum file size to accept in MB. By default, it will accept 20MB.

## License

Koneko is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details. Copyright (c) 2026 Kicya LLC.