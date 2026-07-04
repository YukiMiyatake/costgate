# CostGate Gate

stdio MCP gateway (Go). Filters `tools/list` to cut token cost; delegates calls to backend MCPs.

## Build

```bash
# from repo root (requires Go 1.25+)
npm run build:gate
```

## Modes

| `COSTGATE_GATE_MODE` | Behavior |
|----------------------|----------|
| `filter` (default) | Tier A/B/C + meta tools |
| `transparent` | Pass-through (MVP / baseline comparison) |

## Filter mode (v0.2)

- **Tier A** (~20%): always in `tools/list`
- **Tier B** (~30%): in list when `COSTGATE_INTENT` keywords match
- **Tier C**: hidden — use `discover_tools` + `invoke_tool`
- **Meta tools** (always): `discover_tools`, `invoke_tool`
- **Usage**: `~/.costgate/usage.json` (+ optional import from Probe JSONL logs)

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `COSTGATE_CONFIG` | `~/.costgate/backends.json` | Backend MCP processes |
| `COSTGATE_GATE_MODE` | `filter` | `filter` or `transparent` |
| `COSTGATE_INTENT` | (empty) | Keywords to expose Tier B tools |
| `COSTGATE_USAGE_PATH` | `~/.costgate/usage.json` | Tool usage store |
| `COSTGATE_PROBE_LOG_DIR` | `~/.costgate/logs` | Probe logs for usage import |

## Cursor

See [examples/cursor/mcp-gate-github.json](../../examples/cursor/mcp-gate-github.json).

- **serena** — direct in Cursor
- **costgate-gate** — GitHub MCP (filtered)

## Tests

```bash
npm run test:gate            # transparent mode (26 tools)
npm run test:gate:filter     # filter mode + discover_tools
npm run compare              # Before/After token estimate report
```

## Before/After comparison

```bash
npm run compare
npm run compare -- --intent "pull request"
npm run compare -- --via-probe    # use Probe as baseline
npm run compare -- --json
```

Measures `tools/list` schema size: **gate transparent** (or Probe) vs **gate filter**.
