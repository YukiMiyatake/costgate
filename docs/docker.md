# Docker development

> **Languages:** English (this file) · [日本語](./ja/docker.md)

CostGate uses Docker for **toolchain isolation** (Node + Go). Cursor still runs MCP on the **host** — paths in `mcp.json` are always host paths.

## Quick start (Docker only — no host Node/Go)

```bash
cd costgate

# First-time setup (install + build + gate)
chmod +x docker.sh
./docker.sh npm install
./docker.sh npm run build
./docker.sh npm run build:gate

# or if npm is on the host
npm run docker:setup
```

Cursor MCP configuration:

```bash
./docker.sh node scripts/cursor-mcp.mjs production
# Reload Window
```

## Daily commands

| Host has Node | Docker only |
|---------------|-------------|
| `npm run build` | `./docker.sh npm run build` |
| `npm run build:gate` | `./docker.sh npm run build:gate` |
| `npm run compare` | `./docker.sh npm run compare` |
| `npm run cursor:update` | `npm run docker:update` (rebuild locally) |

Generic wrapper:

```bash
./docker.sh npm run test:tokens
npm run docker -- npm run compress-report   # when npm is on host
```

## Toolchain service

`docker-compose.dev.yml` **`toolchain`** = **Node 22 + Go 1.25** (`.docker/Dockerfile`).

Mounts:

| Host | Purpose |
|------|---------|
| Repository `./` | Source and build artifacts |
| `~/.costgate` | backends.json / Probe logs |
| `~/.cursor` | `cursor:production` updates `mcp.json` |

`COSTGATE_HOST_ROOT=${PWD}` ensures `cursor:production` from inside the container writes **host absolute paths** to `mcp.json`.

## What Docker is NOT for

- Running MCP processes as long-lived Compose services (Cursor spawns stdio on the host)
- `feat:ship` / `gh` (needs host git credentials; builds and benchmarks in Docker are fine)

## Dev Container

Command Palette → **Dev Containers: Reopen in Container**

`.devcontainer/` + `toolchain` image. Use normal `npm run build` inside the container terminal.

## Legacy

```bash
docker compose -f docker-compose.dev.yml run --rm toolchain bash
```

`dev` / `go` service names are aliases for `toolchain`.
