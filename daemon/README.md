# Crawler Service

## Setup

Install dependencies:

```bash
pnpm install
```

### Development scripts

- `pnpm dev` — build in watch mode.
- `pnpm build` — generate production bundles.
- `pnpm test` — run the Vitest suite.

## Proxy Management

Proxy configuration is persisted in a SQLite database via the built-in `node:sqlite` module. The database path is controlled by the `proxyDbPath` config value and defaults to `crawler-proxies.db` in the current working directory.

On startup the service:

1. Creates/opens the SQLite database file.
2. Initializes the schema (table `proxies`).
3. Wires the synchronous `ProxyStore` into `ProxyManager`.

### API

The HTTP API is exposed at `/proxies` on the crawler server only when an admin token is configured. Set `adminToken` in `config.json` or set `CRAWLER_ADMIN_TOKEN` in the environment to a value with at least 16 characters. Send the token as `Authorization: Bearer <token>` or `X-Admin-Token: <token>`. Without a configured token, the proxy management API and `/shutdown` endpoint are disabled.

The config file's `adminToken` takes precedence. `CRAWLER_ADMIN_TOKEN` is a trimmed fallback only when the config file has no `adminToken` key; it does not override that key. An empty or invalid config token fails validation instead of falling back. An empty environment token leaves administration disabled. Environment tokens are never written into the config file.

To rotate a config token, change `adminToken` and restart the daemon. To use the environment instead, remove the config key, set `CRAWLER_ADMIN_TOKEN`, and recreate the daemon container so it receives the new environment. Changing the environment alone does not rotate a token stored in config. Tokens are loaded once at startup; clients must use the new token after restart.

The example Compose publishes `127.0.0.1:3000:3000`: callers on the Docker host can access it, while direct LAN callers cannot. Keep the service listen host `::` inside the container so Docker port forwarding can reach it. Proxy `host` values are destination addresses, so the local examples use `127.0.0.1`, not the wildcard `::`. Inside Docker, `127.0.0.1` refers to the daemon container; replace those proxy destinations with a reachable proxy service hostname or address when the proxy runs elsewhere.

For remote administration, use an authenticated SSH tunnel to the host's loopback port, or deliberately configure appropriate network access. A valid admin token does not make a loopback-only published port reachable from the LAN. Keep tokens out of URLs and use encrypted transport for remote calls.

The daemon is deployed separately using `daemon/docker-compose.yml`. Updating the root Compose API/Web services does not deploy or restart it. The deployer must rebuild the daemon image, configure its token/proxy destinations, and recreate its container. No deployment is performed by the offline test workflow.

`POST /shutdown` requires the same admin authentication and responds with `202 Accepted` before scheduling graceful shutdown. A Bearer token takes precedence over `X-Admin-Token` when both are provided.

- `GET /proxies` — returns the current proxy pool with health stats.
- `POST /proxies` — accepts JSON body matching:

  ```json
  {
    "protocol": "http|https|socks5",
    "host": "proxy.example.com",
    "port": 8080,
    "username": "optional",
    "password": "optional"
  }
  ```

  Returns `201 Created` with the stored proxy object.

- `DELETE /proxies/:id` — removes the proxy by numeric id. Returns `204 No Content`.

Because state lives in SQLite, proxy cooldowns and success/failure counters survive service restarts.
