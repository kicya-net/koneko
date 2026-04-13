# Koneko

Server-side HTML pre-processor for multi-tenant web hosting.

## CLI

Use the CLI to easily serve a folder with `.cat` and static files. CLI takes `.env` file for the default values.

Help:
```bash
node src/http/cli.js help
```
Serve a folder:
```bash
node src/http/cli.js serve ./public
    --processes 2
    --clean
    --isolates 25
    --memory 64
    --cpu-timeout 25
    --wall-timeout 5000
    --file-size 20
    --sqlite-dir ./dbs
```

## .env

- HOST: The host to run the server on.
- PORT: The port to run the server on.
- SOCK_PATH: The path to the socket file. If set, the server will listen on the socket file instead of the port.
- NUM_THREADS: The number of threads to run. By default, it will use MIN(4, CPU cores).
- ISOLATES_PER_THREAD: The number of isolates to run per thread. By default, it will create 10 isolates per thread.
- HTTPS_PROXY: The HTTP(S) proxy to use for `fetch` requests.
- KONEKO_SECRET: The secret to use for the Koneko API. If set, the server will require the `X-Koneko-Secret` header to be set.
- MAX_FILE_SIZE_MB: The maximum file size to accept in MB. By default, it will accept 20MB.
- SANDBOX_DOMAIN: If set to `1`, the server will sanitize the `Set-Cookie` header by removing the `Domain` cookie attribute.

## License

Koneko is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details. Copyright (c) 2026 Kicya.