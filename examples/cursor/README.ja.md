# Cursor MCP 設定例

> **言語:** [English](README.md) · 日本語（このファイル）

## 本番（推奨）— `@costgate/cli`

```bash
npx @costgate/cli@latest init
# Cursor MCP を再起動
```

`init` が `~/.cursor/mcp.json`、`~/.cursor/hooks.json`、Gate バイナリ、`~/.costgate/backends.json` を設定します。

更新: `npx @costgate/cli update`

### Windows / WSL で Agent が止まったとき

`~/.cursor/hooks.json` は **全ワークスペース共通** です。Cursor 内部エラー `MainThreadShellExec not initialized` と旧設定の `failClosed: true` が重なると、どのワークスペースでもブロックされます。

1. CostGate リポジトリで `npm run cursor:registry`（または `npx @costgate/cli registry`）を再実行 — `failClosed` を外し command を更新
2. Cursor を完全終了して再起動（Reload Window だけでは不足なことあり）
3. 緊急回避: `%USERPROFILE%\.cursor\hooks.json`（Windows）または `~/.cursor/hooks.json`（WSL）を一時リネーム

Windows ネイティブ Cursor では `cmd /c node "E:\..."` 形式になります。`failClosed` を再び有効にする場合のみ `COSTGATE_HOOKS_FAIL_CLOSED=1`。

## 本番（リポジトリ clone）

**[mcp-production.json](./mcp-production.json)** — `npm run cursor:production` でローカルパスを書き込み。

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
