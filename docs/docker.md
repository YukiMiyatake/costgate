# Docker development

CostGate uses Docker for **toolchain isolation**, not for running MCP inside Cursor.

## What Docker is for

| File | Purpose |
|------|---------|
| `docker-compose.dev.yml` | Node 22 + Go 1.22 build environment |
| `docker-compose.test.yml` | CI integration test skeleton (future) |
| `.devcontainer/` | Open repo in Cursor/VS Code Dev Container |

## What Docker is NOT for

- Attaching Probe/Gate to Cursor via `mcp.json` (use host-built binaries)
- Long-running MCP proxy in Compose during daily dev

## Host setup (without Docker)

```bash
npm install && npm run build
npm run build:gate   # requires Go on host
```

## Docker one-shot commands

```bash
# TypeScript build (schema + probe)
docker compose -f docker-compose.dev.yml run --rm dev npm run build

# Go gate binary
docker compose -f docker-compose.dev.yml run --rm go go build \
  -o packages/gate/bin/costgate-gate ./packages/gate/cmd/costgate-gate

# Shell inside dev container
docker compose -f docker-compose.dev.yml run --rm dev bash
```

Or use npm scripts:

```bash
npm run docker:build
npm run docker:gate
```

## Dev Container (recommended for Cursor)

1. Command Palette → **Dev Containers: Reopen in Container**
2. Uses `.devcontainer/devcontainer.json` + `docker-compose.dev.yml`
3. Node + Go available inside; MCP config points to `/app/packages/...`

Example `~/.cursor/mcp.json` when using Dev Container:

```json
{
  "mcpServers": {
    "costgate-probe": {
      "command": "node",
      "args": ["/app/packages/probe/dist/index.js"],
      "env": {
        "COSTGATE_PROBE_LOG_DIR": "/app/.costgate/logs",
        "COSTGATE_CLIENT": "cursor"
      }
    }
  }
}
```

## Integration tests (future)

```bash
docker compose -f docker-compose.test.yml --profile test run --rm test-runner
```

Test runner spawns Probe/Gate as subprocesses with stdio pipes. See `test/README.md`.
