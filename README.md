# Koneko

Server-side HTML pre-processor for multi-tenant web hosting.

## CLI

```
  Usage: koneko [options] [command]
  
  Commands:
    help   Display help
    http   Run internal Koneko HTTP API server
    serve  Serve a project
  
  Options:
    -c, --clean             Render files without .cat extension
    -C, --cpu-timeout <n>   The CPU timeout for each isolate in milliseconds
    -f, --file-size <n>     The maximum file size to accept in MB
    -H, --help              Output usage information
    -h, --host              The host to run the server on
    -i, --isolates <n>      The number of isolates to run
    -m, --memory <n>        The memory limit for each isolate in MB
    -p, --port <n>          The port to run the server on
    -P, --public <value>    Public directory to serve
    -s, --sock              The path to the socket file
    -S, --sqlite-dir        Folder containing SQLite databases
    -t, --threads <n>       The number of worker threads to run
    -w, --wall-timeout <n>  The wall timeout for each isolate in milliseconds
  
  Examples:
    - Serve the current project using ./public
    $ koneko serve .

    - Serve the current project using ./www
    $ koneko serve . --public www

    - Run internal Koneko HTTP service
    $ koneko http --port 3000
```

CLI will take `.env` file for the default values.

## .env

- HOST: The host to run the server on.
- PORT: The port to run the server on.
- SOCK_PATH: The path to the socket file. If set, the server will listen on the socket file instead of the port.
- SQLITE_DIR: The folder containing SQLite databases.
- PUBLIC_DIR: The public directory inside the project root. Defaults to `public`.
- NUM_THREADS: The number of threads to run. By default, it will use MIN(4, CPU cores).
- ISOLATES_PER_THREAD: The number of isolates to run per thread. By default, it will create 10 isolates per thread.
- HTTPS_PROXY: The HTTP(S) proxy to use for `fetch` requests.
- KONEKO_SECRET: The secret to use for the Koneko API. If set, the server will require the `X-Koneko-Secret` header to be set.
- MAX_FILE_SIZE_MB: The maximum file size to accept in MB. By default, it will accept 20MB.
- SANDBOX_DOMAIN: If set to `1`, the server will sanitize the `Set-Cookie` header by removing the `Domain` cookie attribute.

## License

Koneko is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details. Copyright (c) 2026 Kicya.