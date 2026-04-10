# Koneko

Server-side HTML pre-processor for multi-tenant web hosting.

## .env

- PORT: The port to run the server on.
- SOCK_PATH: The path to the socket file. If set, the server will listen on the socket file instead of the port.
- NUM_PROCESSES: The number of processes to run. By default, it will use the number of CPU cores.
- ISOLATES_PER_PROCESS: The number of isolates to run per process. By default, it will create 10 isolates per process.
- HTTPS_PROXY: The HTTP(S) proxy to use for `fetch` requests.