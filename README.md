# @das-fed/dev-proxy

CLI-independent same-origin development proxy for local applications. It routes configured URL prefixes to loopback development servers and sends other requests to an explicit fallback host. HTTP, WebSocket upgrades, and wrapping an existing development command are supported.

## Requirements

- Node.js 18 or newer
- pnpm for repository tests and examples

## Install and run

```sh
pnpm add -D @das-fed/dev-proxy
das-dev-proxy serve --config ./dev-proxy.config.json
das-dev-proxy run --config ./dev-proxy.config.json -- npm run dev
```

`serve` starts only the proxy. `run` starts the proxy and the command after `--`; it stops the child process when the proxy or command exits. The package does not require `@das-fed/upf-cli`.

## Configuration

```json
{
  "listen": { "host": "127.0.0.1", "port": 8101 },
  "fallback": "http://127.0.0.1:8102",
  "routes": [{ "prefix": "/demo/", "target": "http://127.0.0.1:5173" }],
  "devServer": { "port": 5173, "base": "/demo/" }
}
```

- The listener and local route targets must use loopback addresses.
- Unmatched paths go to `fallback`. The longest matching route prefix wins; paths are matched case-sensitively on segment boundaries.
- If a matched local route is unavailable, the proxy returns `502` instead of falling back to the host page.
- `devServer.port` must match a local route target. If set, `devServer.base` must match that route prefix.
- Keep credentials and private environment endpoints out of public configuration and examples.

## Local example

The fixture runs a mock fallback host and a Vite sub-application without BasicApplication or UPF. From the repository root, install both dependency sets:

```sh
pnpm install
pnpm --dir examples/vite-subapp install
```

Start the fallback host in one terminal:

```sh
node examples/local-host/server.js
```

Start the Vite sub-application through the proxy in another terminal:

```sh
node bin/das-dev-proxy.js run --config examples/dev-proxy.config.json -- pnpm --dir examples/vite-subapp dev
```

Open `http://127.0.0.1:8101/`. The host links to `/demo/`, which is routed to Vite. The sub-application requests `/api/health` from the fallback host; edit `examples/vite-subapp/src/main.js` to verify HMR.

Run package tests with `pnpm test`. Public API exports are listed in `src/index.js`.
