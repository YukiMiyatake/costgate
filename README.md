# CostGate

**Gate your MCP. Cut your bill.**

CostGate reduces AI token consumption by optimizing MCP tool definitions and responses.
Cursor-first, compatible with Claude Desktop and other MCP clients.

## Packages

| Package | Description |
|---------|-------------|
| [@costgate/probe](./packages/probe/) | Measurement MCP — baseline token usage, call stats, JSONL logs |
| [costgate-gate](./packages/gate/) | Gateway MCP — filtered tool exposure, delegation, cost reduction |

## Quick start (Probe)

```bash
cd packages/probe
npm install
npm run build
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

See [examples/cursor/](./examples/cursor/) for full configuration.

## Plans (roadmap)

| Plan | Scope |
|------|-------|
| **Free (OSS)** | Probe + Gate core |
| **Pro** | Automated cloud reports (costgate-cloud) |
| **Team / Enterprise** | Team dashboard, policies, custom proposals, support |

## Documentation

- [Architecture](./docs/architecture.md)
- [Log schema](./docs/log-schema.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT — see [LICENSE](./LICENSE)
