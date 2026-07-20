# Installation guide

> **Languages:** English (this file) · [日本語](./ja/installation.md)

CostGate ships as **npm CLI** (`@costgate/cli`) plus a **Go Gate binary** (GitHub Releases).  
**Cursor** is the best-supported client (MCP + hooks + Dashboard). Other MCP clients can use Gate alone.

## Supported platforms

| Platform | Gate binary | `@costgate/cli` | Cursor hooks | Dashboard | Notes |
|----------|:-------------:|:---------------:|:------------:|:---------:|-------|
| **Linux (native)** | ✅ | ✅ | ✅ | ✅ | Recommended for dev |
| **WSL2** | ✅ | ✅ | ✅ | ✅ | Run `npm run cursor:deps` if repo is on `/mnt/c` or `/e` (DrvFs) |
| **macOS** | ✅ (arm64/amd64) | ✅ | ✅ | ✅ | Allow Gate binary on first run if Gatekeeper blocks it |
| **Windows (native)** | ✅ | ✅ | ✅ | ✅ | Use Git Bash or PowerShell; paths under `%USERPROFILE%\.cursor` |
| **Claude Desktop** | ✅ | ✅ | ❌ | optional | Gate MCP only — no Shield hooks |
| **VS Code / other MCP** | ✅ | partial | ❌ | optional | Stdio MCP config only; no Cursor-specific hooks |

Requirements: **Node.js 20+** for CLI/Dashboard. Gate binary is downloaded by `costgate init` (no Go required for end users).

---

## Cursor (recommended)

### End users (npm — when published)

```bash
npx @costgate/cli@latest init
# Restart Cursor MCP or reload the window
```

This configures:

- `~/.cursor/mcp.json` — `costgate-gate` MCP entry
- `~/.cursor/hooks.json` — Shield, prompt-intent, workspace registry
- `~/.costgate/bin/costgate-gate` — Gate binary
- `~/.costgate/backends.json` — backend MCP template (if missing)

### Developers (clone repo)

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build:gate
mkdir -p ~/.costgate && cp examples/backends.github.json ~/.costgate/backends.json
npm run cursor:deps          # WSL/DrvFs: install SDK to ~/.costgate/node_modules
npm run cursor:production    # writes ~/.cursor/mcp.json (local paths)
npm run cursor:registry      # Cursor hooks
# Restart Cursor MCP
```

See [examples/cursor/README.md](../examples/cursor/README.md).

### WSL2 / DrvFs

If the repository lives on a Windows mount (`/mnt/c/...`, `/e/...`), `node_modules` can be **corrupted** (truncated packages). Symptoms:

- CostGate MCP fails to start
- Dashboard log: `dashboard failed to become ready`
- `SyntaxError` in `@modelcontextprotocol/sdk` or `js-tiktoken`

**Fix:**

```bash
npm run cursor:deps
npm run cursor:production
```

This installs Dashboard dependencies under `~/.costgate/node_modules` on the Linux filesystem.

---

## Claude Desktop

CostGate **Gate** works as a stdio MCP server. **Shield hooks are Cursor-only** and are not available here.

1. Install Gate binary or use npx:

```bash
npx @costgate/cli@latest init
# or: ./scripts/install-gate.sh
```

2. Copy [examples/claude-desktop/mcp-gate.json](../examples/claude-desktop/mcp-gate.json) into your Claude Desktop MCP config.

| OS | Config file |
|----|-------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

3. Set `COSTGATE_CONFIG` to `~/.costgate/backends.json` (see example).
4. Restart Claude Desktop.

For tool-list filtering, set `COSTGATE_GATE_MODE=filter` in the MCP `env` block. See [gate-mode.md](./gate-mode.md).

---

## Windows (native)

1. Install [Node.js 20+](https://nodejs.org/).
2. Install [Cursor](https://cursor.com/).
3. In PowerShell or Git Bash:

```bash
npx @costgate/cli@latest init
```

Paths:

- MCP config: `%USERPROFILE%\.cursor\mcp.json`
- CostGate data: `%USERPROFILE%\.costgate\`

If `costgate-gate` is not on `PATH`, `init` still works via `npx @costgate/cli gate`.

---

## macOS

Same as Linux for Cursor. If macOS blocks the downloaded Gate binary:

```bash
xattr -d com.apple.quarantine ~/.costgate/bin/costgate-gate 2>/dev/null || true
```

Or re-run `costgate update` after allowing the binary in System Settings.

---

## Linux

```bash
npx @costgate/cli@latest init
```

Optional: install Gate to `~/.local/bin`:

```bash
./scripts/install-gate.sh
```

---

## Verify installation

```bash
costgate-gate --version          # or ~/.costgate/bin/costgate-gate --version
npm run cursor:mcp -- status     # from cloned repo
```

In Cursor: **Settings → MCP** — `costgate-gate` should show connected tools.

---

## Related docs

- [releases.md](./releases.md) — npm + GitHub Releases
- [gate-mode.md](./gate-mode.md) — `filter` vs `transparent`
- [dashboard.md](./dashboard.md) — local Dashboard UI
- [dev/shield-trust.md](./dev/shield-trust.md) — Shield & MCP Trust (developer)
