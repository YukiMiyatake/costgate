# costgate-gate

CostGate Gateway MCP — filters tool definitions and delegates to backend MCP servers.

## Layout

```
packages/gate/
├── cmd/costgate-gate/    CLI entry point
├── internal/
│   ├── config/           YAML config loading
│   ├── proxy/            stdio MCP proxy + filter
│   └── metrics/          usage store for tier classification
└── go.mod
```

## Status

**Planned** — Go implementation. See [docs/architecture.md](../../docs/architecture.md).

## Build

```bash
# from repo root
npm run build:gate

# or directly
go build -o bin/costgate-gate ./cmd/costgate-gate
```

## Distribution

Single binary for Cursor / Claude Desktop:

```json
{
  "mcpServers": {
    "costgate": {
      "command": "/path/to/costgate-gate",
      "args": ["--config", "/path/to/costgate.yaml"]
    }
  }
}
```

Released via GitHub Releases (same repo as Probe).
