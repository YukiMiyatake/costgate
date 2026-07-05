# Architecture

## Target layout (Cursor)

```
Cursor mcp.json
├── costgate-probe      … backend MCP measurement (development)
└── costgate-gate       … filtered backends (production)
```

Backends (GitHub MCP, etc.) are configured in `~/.costgate/backends.json` and proxied by Probe or Gate — not as separate entries in `mcp.json`.

## Roles

| Component | Purpose |
|---|---|
| **Probe** | Measurement proxy for configured backends; JSONL logs |
| **Gate** | Production proxy — filters `tools/list`, delegates `tools/call` |

## Daily development

```
Cursor
└── costgate-probe   … GitHub measurement (optional · PAT required)
         │
         └── GitHub MCP (subprocess)
```

## Overview

```
Cursor ─────────────┼── costgate-probe ────── GitHub MCP (measurement)
                    └── costgate-gate ─────── GitHub MCP (production)
```

## Probe (measurement)

- stdio proxy for configured backends (GitHub and similar)
- JSONL to `~/.costgate/logs/`

## Gate (production)

- Filters `tools/list` for delegated backends (Tier A/B/C + meta tools)
- `discover_tools` / `invoke_tool` for on-demand access to hidden tools
- Usage store at `~/.costgate/usage.json` (imports Probe JSONL when present)

## Dashboard (Phase 23+)

- Local Web UI: `npm run dashboard` → `http://127.0.0.1:8787`
- Reads Probe/Gate logs, usage store, `mcp.json` — see [dashboard.md](./dashboard.md)
- Developer spec: [dev/dashboard.md](./dev/dashboard.md)

## Cloud (private — costgate-cloud repo)

- Optional metrics upload (opt-in)
- Pro / Enterprise reports and support
