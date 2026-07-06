# Cursor MCP examples

## Production (recommended) — `@costgate/cli`

```bash
npx @costgate/cli@latest init
# Restart Cursor MCP
```

`init` configures `~/.cursor/mcp.json`, `~/.cursor/hooks.json`, Gate binary, and `~/.costgate/backends.json`.

Update: `npx @costgate/cli update`

## Production (from cloned repo)

**[mcp-production.json](./mcp-production.json)** — local paths via `npm run cursor:production`.

Docker のみ（ホスト Node/Go 不要）:

```bash
./docker.sh npm run build:gate
./docker.sh node scripts/cursor-mcp.mjs production
# Reload Window
```

更新（ローカル再ビルド）: `npm run docker:update` — [docs/docker.md](../../docs/docker.md)

- **costgate-gate** — GitHub MCP（Tier フィルタ + `discover_tools`）
- その他の MCP（aieph 等）は `cursor-mcp` が **保持** します

## Measurement (development only)

**[mcp-probe-github.json](./mcp-probe-github.json)** — **costgate-probe**（JSONL 計測）。

```bash
npm run build:probe
npm run cursor:measurement
# Restart Cursor MCP
```

ロールバック・ベースライン再計測時のみ Probe を有効化してください。

## Switch commands

| Command | Effect |
|---------|--------|
| `npm run cursor:production` | `costgate-gate` ON, `costgate-probe` OFF |
| `npm run cursor:measurement` | `costgate-probe` ON, `costgate-gate` OFF |
| `npm run cursor:update` | ローカルで Gate/Probe ビルド + production 設定 |
| `npm run cursor:mcp -- status` | 現在のモードを表示 |

`~/.cursor/mcp.json` は切替前に `mcp.json.bak` へバックアップされます。

## Other examples

| File | Use |
|------|-----|
| [mcp-cli.json](./mcp-cli.json) | `@costgate/cli init` が書き込む構成の参考 |
| [mcp-gate-github.json](./mcp-gate-github.json) | Gate 最小構成（バイナリのみ） |
| [mcp-probe-github.json](./mcp-probe-github.json) | Probe 計測用テンプレート |

## Verify

```bash
npm run test:cursor-gate   # Cursor 相当のクライアント名で Gate を smoke test
```

See [docs/architecture.md](../../docs/architecture.md) and [docs/roadmap.md](../../docs/roadmap.md).
