# @costgate/probe

MCP measurement proxy for CostGate. Sits between your MCP client and backend servers to log token-related metrics.

## Layout

```
packages/probe/
├── src/
│   ├── index.ts      entry point
│   ├── proxy.ts      stdio MCP relay
│   ├── metrics.ts    token / byte estimation
│   └── logger.ts     JSONL output
└── package.json
```

## Status

**Scaffold** — core proxy implementation in progress.

## Usage

```bash
# from repo root
npm run build:probe
npm run dev:probe
```

After publish:

```bash
npx @costgate/probe
```

## Environment

| Variable | Description |
|----------|-------------|
| `COSTGATE_PROBE_LOG_DIR` | Log directory (default: `~/.costgate/logs`) |
| `COSTGATE_CLIENT` | Client name: `cursor`, `claude-desktop`, etc. |
| `COSTGATE_BACKENDS` | JSON config for backend MCP servers to proxy |

## Dependencies

Uses `@costgate/schema` from the same monorepo for log event types.
