# Integration tests

| Scenario | Command |
|----------|---------|
| Probe → mock MCP | `test/run.mjs` (probe section) |
| Gate transparent → mock MCP | `test/run.mjs` |
| Gate filter → mock MCP | `test/run.mjs` |

## Run

```bash
npm run build
npm run build:gate
npm run test:integration
```

No `GITHUB_PERSONAL_ACCESS_TOKEN` required — uses `test/fixtures/mock-mcp`.

Docker:

```bash
docker compose -f docker-compose.test.yml --profile test run --rm test-runner
```
