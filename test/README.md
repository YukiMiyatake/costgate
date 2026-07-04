# Integration tests (skeleton)

Future tests cover:

| Scenario | Description |
|----------|-------------|
| Probe only | `Cursor → Probe → mock MCP` |
| Gate only | `Cursor → Gate → mock MCP` |
| Chain | `Probe → Gate → mock MCP` (Before/After metrics) |

## Run (when implemented)

```bash
docker compose -f docker-compose.test.yml --profile test run --rm test-runner
```

Probe and Gate are **not** Compose services — the test runner starts them as subprocesses with stdio.
