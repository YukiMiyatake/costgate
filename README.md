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

### Option A — npx (published)

```bash
npx @costgate/probe@latest
```

Add to Cursor `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "costgate-probe": {
      "command": "npx",
      "args": ["-y", "@costgate/probe"],
      "env": {
        "COSTGATE_CONFIG": "~/.costgate/backends.json",
        "COSTGATE_PROBE_LOG_DIR": "~/.costgate/logs"
      }
    }
  }
}
```

### Option B — from source

```bash
npm install
npm run build:probe
```

See [examples/cursor/](./examples/cursor/) for full configuration.

## Quick start (Gate)

Requires **Go 1.25+** to build from source, or install a release binary (no Go):

```bash
# Option A — GitHub Release (recommended for end users)
./scripts/install-gate.sh          # → ~/.local/bin/costgate-gate
costgate-gate --version

# Option B — build from source
npm run build:gate
npm run test:gate   # smoke test (GitHub backend via ~/.costgate/backends.json)
```

Releases: [GitHub Releases](https://github.com/YukiMiyatake/costgate/releases) · see [docs/RELEASE.md](./docs/RELEASE.md)

Add to Cursor `~/.cursor/mcp.json` (keep **serena** direct; see [mcp-gate-github.json](./examples/cursor/mcp-gate-github.json)):

```json
{
  "mcpServers": {
    "costgate-gate": {
      "command": "/path/to/costgate/packages/gate/bin/costgate-gate",
      "env": {
        "COSTGATE_CONFIG": "~/.costgate/backends.json"
      }
    }
  }
}
```

**Filter mode (default):** Tier A/B/C + `discover_tools` / `invoke_tool`. Set `COSTGATE_GATE_MODE=transparent` for pass-through baseline. See [packages/gate/README.md](./packages/gate/README.md).

Compare reduction: `npm run compare` (definitions) · `npm run compress-report` (definitions + tool results).

Session breakdown: `npm run session-report` (fixed + variable + overall % scenarios).

Measured benchmarks: [docs/benchmarks.md](./docs/benchmarks.md)

Production Cursor setup: `npm run cursor:production` — see [examples/cursor/README.md](./examples/cursor/README.md).

Cloud metrics (opt-in): `npm run cloud:upload` — see [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud).

## Plans (roadmap)

| Plan | Scope |
|------|-------|
| **Free (OSS)** | Probe + Gate + Dashboard — Phase 16–22 ✅ / **23–27 予定** |
| **Pro** | ホスト型 Dashboard — **Phase 30+**（OSS Dashboard 拡張） |
| **Team** | Billing / policies — **Phase 32+ 後回し** |

OSS 機能を先に完成させ、cloud は MVP（手動 upload）を維持したまま凍結。詳細は [docs/roadmap.md](./docs/roadmap.md#development-priority2026-07)。

See [docs/roadmap.md](./docs/roadmap.md) for phase details.

## Documentation

- [Development roadmap](./docs/roadmap.md)
- [MCP Dashboard（利用者向け）](./docs/dashboard.md)
- [MCP Dashboard（開発者向け）](./docs/dev/dashboard.md)
- [Benchmarks & verification](./docs/benchmarks.md)
- [Repository structure](./docs/structure.md)
- [Docker / Dev Container](./docs/docker.md)
- [Gate releases](./docs/releases.md)
- [Architecture](./docs/architecture.md)
- [Log schema](./docs/log-schema.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT — see [LICENSE](./LICENSE)
