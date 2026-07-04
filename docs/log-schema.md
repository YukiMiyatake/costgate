# Log schema (JSONL)

Shared between Probe, Gate, and costgate-cloud. One JSON object per line.

## Event types

| `type` | Description |
|--------|-------------|
| `session_start` | Probe/Gate session began |
| `session_end` | Session ended |
| `tools_list` | `tools/list` response observed |
| `tool_call` | Tool invocation |
| `tool_result` | Tool response |

## Common fields

```jsonc
{
  "type": "tool_call",
  "ts": "2026-07-04T08:00:00.000Z",
  "session_id": "uuid",
  "client": "cursor",           // cursor | claude-desktop | vscode | unknown
  "backend": "serena",          // backend MCP server name
  "tool": "find_symbol",
  "request_bytes": 256,
  "response_bytes": 4096,
  "estimated_tokens": 1200,
  "duration_ms": 45
}
```

## tools_list event

```jsonc
{
  "type": "tools_list",
  "ts": "2026-07-04T08:00:00.000Z",
  "session_id": "uuid",
  "tool_count": 47,
  "total_schema_bytes": 85000,
  "estimated_tokens": 21000,
  "tools": [
    { "name": "find_symbol", "schema_bytes": 1200, "estimated_tokens": 300 }
  ]
}
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COSTGATE_PROBE_LOG_DIR` | `~/.costgate/logs` | Log output directory |
| `COSTGATE_CLIENT` | `unknown` | Client identifier override |
