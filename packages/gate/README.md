# CostGate Gate MVP

Transparent stdio MCP proxy (Go). Delegates to GitHub MCP — no filtering yet.

## Build

```bash
# from repo root (requires Go 1.25+)
npm run build:gate

# or
cd packages/gate && go build -o bin/costgate-gate ./cmd/costgate-gate
```

## Cursor

See [examples/cursor/mcp-gate-github.json](../../examples/cursor/mcp-gate-github.json).

- **serena** — direct in Cursor
- **costgate-gate** — GitHub MCP (replaces costgate-probe for production path)

Uses the same `~/.costgate/backends.json` as Probe.

## MVP scope

- ✅ Transparent `tools/list` + `tools/call` forwarding
- ❌ Tool filtering (Phase B)
- ❌ `discover_tools` meta tools (Phase B)
