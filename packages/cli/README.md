# @costgate/cli

CostGate **npm entry package**. Downloads the Go `costgate-gate` binary from GitHub Releases and bundles Dashboard + Cursor Hooks.

> **Languages:** English (this file) · [日本語](README.ja.md)

## Quick start

```bash
npx @costgate/cli@latest init
# Restart Cursor (reconnect MCP)
```

What `init` does:

1. Install `costgate-gate` to `~/.costgate/bin/` (from GitHub Releases)
2. Create `~/.costgate/backends.json` template (if missing)
3. Update `~/.cursor/mcp.json` for production (`npx @costgate/cli gate`)
4. Merge Shield / prompt-intent hooks into `~/.cursor/hooks.json`

## Commands

| Command | Description |
|---------|-------------|
| `costgate init` | Full first-time setup |
| `costgate gate` | Cursor MCP entry (Dashboard + Gate) |
| `costgate dashboard` | Start dashboard manually |
| `costgate registry` | Re-install Cursor hooks only |
| `costgate update` | Re-download Gate binary + refresh hooks |
| `costgate shield sanitize-prompt` | Sanitize prompt (CLI) |

## Distribution model

| Layer | Distribution | Notes |
|-------|--------------|-------|
| **Gate** | GitHub Releases (Go binary) | Fetched by `init` / `update` |
| **CLI** | npm (this package) | Bundles `scripts/` + `catalog/` in `runtime/` |
| **Probe** | npm `@costgate/probe` | Measurement only (separate package) |

## Development (monorepo)

```bash
npm run build -w @costgate/cli   # copy scripts into runtime/
node packages/cli/bin/costgate.mjs init --force-gate
```

When cloned, uses `packages/gate/bin/costgate-gate` if present instead of downloading.

## Environment variables

| Variable | Description |
|----------|-------------|
| `COSTGATE_BIN_DIR` | Gate binary install dir (default `~/.costgate/bin`) |
| `COSTGATE_RUNTIME_ROOT` | Runtime root (set automatically) |
| `COSTGATE_GATE_BIN` | Gate binary path (set automatically) |
