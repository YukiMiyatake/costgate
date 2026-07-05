# @costgate/probe

MCP measurement proxy for CostGate. Measures **GitHub and other heavy MCPs** configured in `~/.costgate/backends.json`.

## Policy

- **Probe**: wraps configured backends (e.g. GitHub MCP) for JSONL metrics.

## Layout

```
packages/probe/
├── src/
│   ├── index.ts
│   ├── proxy.ts
│   ├── metrics.ts
│   ├── logger.ts
│   ├── config.ts
│   └── backend.ts
└── package.json
```

## Usage

```bash
npm run build:probe
```

Configure `COSTGATE_CONFIG` → [examples/backends.github.json](../../examples/backends.github.json).

Cursor example: [examples/cursor/mcp-probe-github.json](../../examples/cursor/mcp-probe-github.json).

## Environment

| Variable | Description |
|----------|-------------|
| `COSTGATE_CONFIG` | Backends JSON path (default: `~/.costgate/backends.json`) |
| `COSTGATE_PROBE_LOG_DIR` | Log directory (default: `~/.costgate/logs`) |
| `COSTGATE_CLIENT` | Client id: `cursor`, `claude-desktop`, etc. |
