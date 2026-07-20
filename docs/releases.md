# CostGate distribution & Gate releases

> **Languages:** English (this file) · [日本語](./ja/releases.md)

## Recommended install (`@costgate/cli`)

**One command** for Gate binary + Dashboard + Cursor hooks:

```bash
npx @costgate/cli@latest init
# Restart Cursor MCP
```

| Command | Description |
|---------|-------------|
| `costgate init` | Full setup |
| `costgate gate` | MCP entry (used by Cursor via npx) |
| `costgate update` | Re-download Gate + refresh `mcp.json` version pin + hooks |
| `costgate registry` | Hooks only |

Global install: `npm install -g @costgate/cli && costgate init`

See [packages/cli/README.md](../packages/cli/README.md).

---

## Gate binary (GitHub Releases)

`costgate-gate` is a **Go binary** on GitHub Releases. `@costgate/cli init` downloads to `~/.costgate/bin/` automatically.

Manual install:

```bash
chmod +x scripts/install-gate.sh
./scripts/install-gate.sh              # latest → ~/.local/bin
./scripts/install-gate.sh v1.0.0       # specific tag
INSTALL_DIR=/usr/local/bin ./scripts/install-gate.sh
```

Verify:

```bash
costgate-gate --version
# costgate-gate 1.0.0 (abc1234)
```

### Platforms

| OS | Arch | Archive |
|----|------|---------|
| linux | amd64, arm64 | `.tar.gz` |
| darwin | amd64, arm64 | `.tar.gz` |
| windows | amd64, arm64 | `.zip` |

Asset: `costgate-gate_{version}_{os}_{arch}.{tar.gz|zip}`

---

## Maintainer: cut a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions:

| Workflow | Output |
|----------|--------|
| `release.yml` | Gate binaries (goreleaser) |
| `npm-publish.yml` | `@costgate/schema`, `@costgate/probe`, `@costgate/cli` |

Requires **`NPM_TOKEN`** secret.

```bash
npm run publish:check
npm run release:check
```

---

## npm packages

| Package | Use |
|---------|-----|
| `@costgate/cli` | Production entry — `init`, launcher, Dashboard |
| `@costgate/probe` | Measurement only — `npx @costgate/probe` |

---

## Cursor setup options

### A — CLI (recommended)

`npx @costgate/cli init` writes:

```json
{
  "mcpServers": {
    "costgate-gate": {
      "command": "npx",
      "args": ["-y", "@costgate/cli@1.0.0", "gate"],
      "env": { "COSTGATE_CONFIG": "${workspaceFolder}/.costgate/backends.json", ... }
    }
  }
}
```

### B — Binary only (minimal)

[examples/cursor/mcp-gate-github.json](../examples/cursor/mcp-gate-github.json)

### C — From cloned repo (developers)

`npm run cursor:production`
