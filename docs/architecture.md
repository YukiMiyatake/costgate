# Architecture

## Overview

```
Client (Cursor / Claude Desktop / VS Code)
        │
        ▼
┌───────────────────┐
│ CostGate Probe    │  ← development & baseline measurement
│ or CostGate Gate  │  ← production cost reduction
└─────────┬─────────┘
          │ stdio JSON-RPC
          ▼
   Backend MCP servers (browser, serena, git, …)
```

## Probe (measurement)

- Transparent stdio proxy in front of backend MCP servers
- Logs tool definition sizes, call counts, response sizes
- Estimates tokens (tiktoken)
- Outputs JSONL to `~/.costgate/logs/`

## Gate (production)

- Filters `tools/list` by usage tier and intent
- Meta tools: `discover_tools`, `invoke_tool`
- Delegates to backend MCP servers
- Single binary distribution (Go)

## Cloud (private — costgate-cloud repo)

- Optional metrics upload (opt-in)
- Pro: automated monthly reports
- Enterprise: custom cost-cut proposals, support
