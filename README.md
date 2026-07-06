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
│   ├── cli/        @costgate/cli       — npm entry (launcher, Dashboard, hooks)
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

## Quick start（本番・推奨）

**Node のみ**で導入できます（Go のビルド不要）。Gate バイナリは `init` が GitHub Releases から取得します。

```bash
npx @costgate/cli@latest init
# Cursor を再起動（MCP 再接続）
```

`init` の内容:

- `~/.costgate/bin/costgate-gate` — Go バイナリ配置
- `~/.cursor/mcp.json` — `npx @costgate/cli gate`（Dashboard 自動起動込み）
- `~/.cursor/hooks.json` — Shield / prompt-intent 等
- `~/.costgate/backends.json` — テンプレート（未存在時）

更新: `npx @costgate/cli update`

詳細: [packages/cli/README.md](./packages/cli/README.md) · [docs/releases.md](./docs/releases.md)

### グローバルインストール（任意）

```bash
npm install -g @costgate/cli
costgate init
```

## Quick start（開発者・リポジトリ clone）

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build:gate          # または ./scripts/install-gate.sh
cp examples/backends.github.json ~/.costgate/backends.json
npm run cursor:production   # ローカルパスで mcp.json 更新
npm run cursor:registry     # hooks 登録
```

Docker のみ: [docs/docker.md](./docs/docker.md)

## Quick start (Probe — 計測のみ)

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

## Gate（上級者向け・バイナリのみ）

Go バイナリだけ使う最小構成（Dashboard / Hooks なし）:

```bash
./scripts/install-gate.sh          # → ~/.local/bin/costgate-gate
costgate-gate --version
```

`~/.cursor/mcp.json` 例: [examples/cursor/mcp-gate-github.json](./examples/cursor/mcp-gate-github.json)

リポジトリからビルド: `npm run build:gate`（Go 1.25+）

Releases: [GitHub Releases](https://github.com/YukiMiyatake/costgate/releases) · [docs/RELEASE.md](./docs/RELEASE.md)

**Filter mode (default):** Tier A/B/C + `discover_tools` / `invoke_tool`. See [packages/gate/README.md](./packages/gate/README.md).

Compare reduction: `npm run compare` (definitions) · `npm run compress-report` (definitions + tool results).

Session breakdown: `npm run session-report` (fixed + variable + overall % scenarios).

Measured benchmarks: [docs/benchmarks.md](./docs/benchmarks.md)

Production Cursor setup (clone): `npm run cursor:production` — see [examples/cursor/README.md](./examples/cursor/README.md).

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
- [MCP トークン削減調査](./docs/mcp-reduction-survey.md)
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
