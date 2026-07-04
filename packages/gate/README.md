# costgate-gate

CostGate Gateway MCP — filters tool definitions and delegates to backend MCP servers.

## Status

**Planned** — Go implementation. See [docs/architecture.md](../../docs/architecture.md).

## Build (when implemented)

```bash
go build -o bin/costgate-gate ./cmd/costgate-gate
```

## Distribution

Single binary for Cursor / Claude Desktop configuration:

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
