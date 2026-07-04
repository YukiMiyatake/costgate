# Contributing to CostGate

## Development setup

```bash
git clone https://github.com/costgate/costgate.git
cd costgate
npm install
npm run build:probe
```

## Branch policy

- Default branch: `main`
- Feature branches: `feature/<name>`
- Commit messages: Japanese or English, concise

## Packages

- **probe** — TypeScript / Node.js (MCP measurement)
- **gate** — Go (MCP gateway, in development)

## Log schema

Probe and Gate share the JSONL log format defined in [docs/log-schema.md](./docs/log-schema.md).
Changes to the schema require updating both packages and costgate-cloud.
