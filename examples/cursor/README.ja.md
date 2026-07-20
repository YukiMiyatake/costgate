# Cursor MCP 設定例

> **言語:** [English](README.md) · 日本語（このファイル）

## 本番（推奨）— `@costgate/cli`

```bash
npx @costgate/cli@latest init
# Cursor MCP を再起動
```

`init` が `~/.cursor/mcp.json`、`~/.cursor/hooks.json`、Gate バイナリ、`~/.costgate/backends.json` を設定します。

更新: `npx @costgate/cli update`

## 本番（リポジトリ clone）

**[mcp-production.json](./mcp-production.json)** — `npm run cursor:production` でローカルパスを書き込み。

```bash
npm install
npm run build:gate
mkdir -p ~/.costgate && cp examples/backends.github.json ~/.costgate/backends.json
npm run cursor:deps         # WSL/DrvFs では必須（SDK を ~/.costgate へ）
npm run cursor:production   # ワークスペース .costgate/backends.json もシード
npm run cursor:registry
# Cursor MCP を再起動
```

Docker のみ:

```bash
./docker.sh npm run build:gate
./docker.sh node scripts/cursor-mcp.mjs production
```

更新: `npm run docker:update` — [docs/ja/docker.md](../../docs/ja/docker.md)

## 計測（開発のみ）

```bash
npm run build:probe
npm run cursor:measurement
```

ロールバック・ベースライン再計測時のみ Probe を有効化してください。

## 切替コマンド

| コマンド | 効果 |
|---------|------|
| `npm run cursor:production` | Gate ON、Probe OFF |
| `npm run cursor:measurement` | Probe ON、Gate OFF |
| `npm run cursor:update` | 再ビルド + production 設定 |
| `npm run cursor:mcp -- status` | 現在のモード表示 |

## その他の例

| ファイル | 用途 |
|---------|------|
| [mcp-cli.json](./mcp-cli.json) | `init` が書き込む構成の参考 |
| [mcp-gate-github.json](./mcp-gate-github.json) | バイナリのみ最小構成 |
| [mcp-probe-github.json](./mcp-probe-github.json) | Probe 計測用 |

## 検証

```bash
npm run test:cursor-gate
```

関連: [architecture.md](../../docs/architecture.md) · [roadmap.md](../../docs/roadmap.md)
