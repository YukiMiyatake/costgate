# CostGate

**Gate your MCP. Cut your bill.**

CostGate reduces AI token consumption by optimizing MCP tool definitions and responses.
Cursor-first, compatible with Claude Desktop and other MCP clients.

## Repository layout (monorepo)

```
costgate/
├── packages/
│   ├── schema/     @costgate/schema   — shared log schema
│   ├── probe/      @costgate/probe    — measurement MCP (npm)
│   └── gate/       costgate-gate      — gateway MCP (Go binary)
├── docs/
├── examples/
└── scripts/
```

See [docs/structure.md](./docs/structure.md) for why Probe and Gate share one repo.

## Packages

| Package | Dist | Description |
|---------|------|-------------|
| [@costgate/probe](./packages/probe/) | npm | Measurement MCP — baseline token usage, call stats, JSONL logs |
| [costgate-gate](./packages/gate/) | binary | Gateway MCP — filtered tool exposure, delegation, cost reduction |
| [@costgate/schema](./packages/schema/) | workspace | Shared JSON Schema for logs |

## Quick start (Probe)

```bash
npm install
npm run build:probe
```

Add to Cursor `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "costgate-probe": {
      "command": "node",
      "args": ["/path/to/costgate/packages/probe/dist/index.js"],
      "env": {
        "COSTGATE_PROBE_LOG_DIR": "~/.costgate/logs"
      }
    }
  }
}
```

Or after npm publish: `npx @costgate/probe`

See [examples/cursor/](./examples/cursor/) for full configuration.

## Plans (roadmap)

| Plan | Scope |
|------|-------|
| **Free (OSS)** | Probe + Gate core |
| **Pro** | Automated cloud reports ([costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud)) |
| **Team / Enterprise** | Team dashboard, policies, custom proposals, support |

## Documentation

- [Repository structure](./docs/structure.md)
- [Architecture](./docs/architecture.md)
- [Log schema](./docs/log-schema.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT — see [LICENSE](./LICENSE)
