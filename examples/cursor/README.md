# Cursor + Serena via CostGate Probe

Replace direct `serena` entry in `~/.cursor/mcp.json` with Probe.
Probe spawns Serena as a backend subprocess.

## Setup

```bash
cd /path/to/costgate
npm install
npm run build:probe
```

Copy or merge [mcp-probe-serena.json](./mcp-probe-serena.json) into `~/.cursor/mcp.json`.
Adjust absolute paths for your machine.

## Logs

JSONL files are written to `~/.costgate/logs/probe-YYYY-MM-DD.jsonl`.

Events:

- `session_start` / `session_end`
- `tools_list` — tool definition sizes (fixed token cost)
- `tool_call` — per-invocation request/response sizes

## Note

Do **not** enable both `serena` and `costgate-probe` at once (Serena would start twice).
