# Cursor MCP examples

## Recommended

**[mcp-direct-serena.json](./mcp-direct-serena.json)** — Serena 直結（常時）。

**[mcp-probe-github.json](./mcp-probe-github.json)** — Serena 直結 + Probe が GitHub MCP を計測（要 PAT）。

Probe は **Serena を subprocess で起動しません。** Serena と Probe は同時 ON 可。

## Setup Probe + GitHub

1. Copy [backends.github.json](../backends.github.json) → `~/.costgate/backends.json`
2. Set `GITHUB_PERSONAL_ACCESS_TOKEN`
3. Merge [mcp-probe-github.json](./mcp-probe-github.json) into `~/.cursor/mcp.json`
4. `npm run build:probe`

## Future (Gate)

`costgate-gate` replaces direct GitHub path; Serena stays direct.

See [docs/architecture.md](../../docs/architecture.md).
