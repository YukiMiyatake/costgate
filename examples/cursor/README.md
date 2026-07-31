# Cursor MCP examples

> **Languages:** English (this file) · [日本語](README.ja.md)

## Production (recommended) — `@costgate/cli`

```bash
npx @costgate/cli@latest init
# Restart Cursor MCP
```

`init` configures `~/.cursor/mcp.json`, `~/.cursor/hooks.json`, Gate binary, and `~/.costgate/backends.json`.

Update: `npx @costgate/cli update`

### Windows / WSL: Agent stuck / “MainThreadShellExec not initialized”

User hooks apply to **all workspaces on that Cursor host**. WSL Cursor and Windows Cursor use different `hooks.json` files.

Typical failure: `MainThreadShellExec not initialized` + legacy `failClosed: true` → Agent blocked everywhere.

This also hits **other workspaces** (e.g. CastLine AI) — user hooks are per Cursor host, not per project.

1. From CostGate: `npm run cursor:hooks:repair` (or `cursor:registry`) — from WSL also updates Windows Cursor hooks when detectable
2. **Fully quit all Cursor windows** and reopen (Reload alone is often not enough)
3. If still stuck: `Developer: Reload Window`; emergency: rename `%USERPROFILE%\.cursor\hooks.json`

| Env | Meaning |
|-----|---------|
| `COSTGATE_HOOKS_WINDOWS=0` | Do not also write Windows hooks from WSL |
| `COSTGATE_WINDOWS_HOOKS_PATH` | Explicit Windows hooks.json path (WSL-visible `/mnt/c/...`) |
| `COSTGATE_HOOKS_FAIL_CLOSED=1` | Re-enable hooks.json failClosed (not recommended) |

## Production (from cloned repo)

**[mcp-production.json](./mcp-production.json)** — local paths via `npm run cursor:production`.

Docker only (no host Node/Go):

```bash
./docker.sh npm run build:gate
./docker.sh node scripts/cursor-mcp.mjs production
# Reload Window
```

Updates: `npm run docker:update` — [docs/docker.md](../../docs/docker.md)

- **costgate-gate** — GitHub MCP (Tier filter + `discover_tools`)
- Other MCPs (e.g. aieph) are **preserved** by `cursor-mcp`

## Measurement (development only)

**[mcp-probe-github.json](./mcp-probe-github.json)** — **costgate-probe** (JSONL logs).

```bash
npm run build:probe
npm run cursor:measurement
# Restart Cursor MCP
```

Enable Probe only for rollback or baseline re-measurement.

## Switch commands

| Command | Effect |
|---------|--------|
| `npm run cursor:production` | `costgate-gate` ON, `costgate-probe` OFF |
| `npm run cursor:measurement` | `costgate-probe` ON, `costgate-gate` OFF |
| `npm run cursor:update` | Rebuild Gate/Probe locally + production config |
| `npm run cursor:mcp -- status` | Show current mode |

`~/.cursor/mcp.json` is backed up to `mcp.json.bak` before changes.

## Other examples

| File | Use |
|------|-----|
| [mcp-cli.json](./mcp-cli.json) | Reference for `@costgate/cli init` output |
| [mcp-gate-github.json](./mcp-gate-github.json) | Minimal Gate (binary only) |
| [mcp-probe-github.json](./mcp-probe-github.json) | Probe measurement template |

## Verify

```bash
npm run test:cursor-gate
```

See [docs/architecture.md](../../docs/architecture.md) and [docs/roadmap.md](../../docs/roadmap.md).
