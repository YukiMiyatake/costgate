# Log schema (JSONL)

Shared between Probe, Gate, and costgate-cloud. One JSON object per line.

**Canonical definition:** [`packages/schema/log-event.schema.json`](../packages/schema/log-event.schema.json)

## Event types

| `type` | Description |
|--------|-------------|
| `session_start` | Probe/Gate session began |
| `session_end` | Session ended |
| `tools_list` | `tools/list` response observed |
| `tool_call` | Tool invocation |
| `tool_result` | Tool response |
| `gate_event` | Gate production event (`event`: `tools_list` \| `tool_call`; no `session_id`) |

## Common fields (Probe)

```jsonc
{
  "type": "tool_call",
  "ts": "2026-07-04T08:00:00.000Z",
  "session_id": "uuid",
  "client": "cursor",           // cursor | claude-desktop | vscode | unknown
  "backend": "github",          // backend MCP server name
  "tool": "search_code",
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

## gate_event (Gate production)

Gate writes `gate-YYYY-MM-DD.jsonl` when Probe is off. No `session_id`.

```jsonc
// tools/list exposure snapshot
{
  "type": "gate_event",
  "event": "tools_list",
  "ts": "2026-07-04T08:00:00.000Z",
  "backend": "github",
  "tools_exposed": 8,
  "tokens_est": 1200
}

// tool invocation (includes compression stats when applicable)
{
  "type": "gate_event",
  "event": "tool_call",
  "ts": "2026-07-04T08:00:05.000Z",
  "tool": "search_issues",
  "response_bytes": 4096,
  "compressed": true,
  "saved_bytes": 32000
}
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COSTGATE_PROBE_LOG_DIR` | `~/.costgate/logs` | Probe log output directory |
| `COSTGATE_GATE_LOG` | `1` | Gate event log ON/OFF |
| `COSTGATE_GATE_LOG_DIR` | `~/.costgate/logs` | Gate log output directory |
| `COSTGATE_CLIENT` | `unknown` | Client identifier override |
