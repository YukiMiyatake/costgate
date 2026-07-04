# @costgate/probe

MCP measurement proxy for CostGate. Sits between your MCP client and backend servers to log token-related metrics.

## Status

**Scaffold** — core proxy implementation in progress.

## Usage

```bash
npm install
npm run build
```

Configure as an MCP server in Cursor or Claude Desktop. See [examples](../../examples/).

## Environment

| Variable | Description |
|----------|-------------|
| `COSTGATE_PROBE_LOG_DIR` | Log directory (default: `~/.costgate/logs`) |
| `COSTGATE_CLIENT` | Client name: `cursor`, `claude-desktop`, etc. |
| `COSTGATE_BACKENDS` | JSON config for backend MCP servers to proxy |
