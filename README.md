# CostGate

**Gate your MCP. Cut your bill.**

CostGate reduces AI token consumption by optimizing MCP tool definitions and responses.  
Cursor-first, compatible with Claude Desktop and other MCP clients.

> **Languages:** English (this file) · [日本語](README.ja.md)

## Repository layout (monorepo)

```
costgate/
├── packages/
│   ├── schema/     @costgate/schema   — shared log schema
│   ├── probe/      @costgate/probe    — measurement MCP (npm)
│   ├── cli/        @costgate/cli      — npm entry (launcher, Dashboard, hooks)
│   └── gate/       costgate-gate      — gateway MCP (Go binary)
├── docs/
├── examples/
└── scripts/
```

See [docs/structure.md](./docs/structure.md) for why Probe and Gate share one repo.

## Packages

| Package | Dist | Description |
|---------|------|-------------|
| [@costgate/cli](./packages/cli/) | npm | **Recommended entry** — `init`, Gate launcher, Dashboard, Cursor hooks |
| [@costgate/probe](./packages/probe/) | npm | Measurement MCP — baseline token usage, call stats, JSONL logs |
| [costgate-gate](./packages/gate/) | GitHub Releases | Gateway MCP (Go) — filtered tools, Shield, cost reduction |
| [@costgate/schema](./packages/schema/) | workspace | Shared JSON Schema for logs |

## Quick start (production — recommended)

Install with **Node only** (no Go build). `init` downloads the Gate binary from GitHub Releases.

```bash
npx @costgate/cli@latest init
# Restart Cursor (reconnect MCP)
```

What `init` does:

- `~/.costgate/bin/costgate-gate` — Go binary
- `~/.cursor/mcp.json` — `npx @costgate/cli gate` (Dashboard auto-start)
- `~/.cursor/hooks.json` — Shield, prompt-intent, etc.
- `~/.costgate/backends.json` — template (if missing)

Update: `npx @costgate/cli update`

Details: [packages/cli/README.md](./packages/cli/README.md) · [docs/releases.md](./docs/releases.md)

### Global install (optional)

```bash
npm install -g @costgate/cli
costgate init
```

## Quick start (developers — clone repo)

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build:gate          # or ./scripts/install-gate.sh
cp examples/backends.github.json ~/.costgate/backends.json
npm run cursor:production   # update mcp.json with local paths
npm run cursor:registry     # install hooks
```

Docker only: [docs/docker.md](./docs/docker.md)

## Quick start (Probe — measurement only)

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

See [examples/cursor/](./examples/cursor/) for measurement configuration.

## Gate (advanced — binary only)

Minimal setup without Dashboard or hooks:

```bash
./scripts/install-gate.sh          # → ~/.local/bin/costgate-gate
costgate-gate --version
```

Example `~/.cursor/mcp.json`: [examples/cursor/mcp-gate-github.json](./examples/cursor/mcp-gate-github.json)

Build from repo: `npm run build:gate` (Go 1.25+)

Releases: [GitHub Releases](https://github.com/YukiMiyatake/costgate/releases) · [docs/RELEASE.md](./docs/RELEASE.md)

**Filter mode (default):** Tier A/B/C + `discover_tools` / `invoke_tool`. See [packages/gate/README.md](./packages/gate/README.md).

Compare reduction: `npm run compare` (definitions) · `npm run compress-report` (definitions + tool results).

Session breakdown: `npm run session-report` (fixed + variable + overall % scenarios).

Measured benchmarks: [docs/benchmarks.md](./docs/benchmarks.md)

Production Cursor setup (clone): `npm run cursor:production` — see [examples/cursor/README.md](./examples/cursor/README.md).

**OSS is 100% local** — no cloud services, no org policies. Hosted LoopGate: [docs/ecosystem/plans.md](./docs/ecosystem/plans.md).

## Plans (roadmap)

| Plan | Scope |
|------|-------|
| **Free (OSS)** | CostGate — Probe + Gate + Dashboard |
| **LoopGate Starter / Pro / Enterprise** | Hosted LoopOps SaaS — see [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud) (private) |

**OSS vs Cloud feature split:** [docs/ecosystem/plans.md](./docs/ecosystem/plans.md)

See [docs/roadmap.md](./docs/roadmap.md) for OSS phase details.

## Documentation

- [Documentation languages](./docs/i18n.md)
- [Development roadmap](./docs/roadmap.md)
- [MCP Dashboard (users)](./docs/dashboard.md) · [日本語](./docs/ja/dashboard.md)
- [MCP token reduction survey](./docs/mcp-reduction-survey.md)
- [MCP Dashboard (developers)](./docs/dev/dashboard.md)
- [Benchmarks & verification](./docs/benchmarks.md)
- [Repository structure](./docs/structure.md)
- [Docker / Dev Container](./docs/docker.md)
- [Gate releases](./docs/releases.md)
- [Architecture](./docs/architecture.md)
- [Log schema](./docs/log-schema.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT — see [LICENSE](./LICENSE)
