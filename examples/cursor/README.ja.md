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

`hooks.json` は Cursor ホストごとに **全ワークスペース共通** です。WSL と Windows の Cursor は別ホスト（別ファイル）です。

典型エラー:
`MainThreadShellExec not initialized` + 旧 `failClosed: true` → 全ワークスペースでブロック

CastLine など **別ワークスペースの AI 画面でも同じ**です（user hooks はホスト共通）。

1. CostGate で `npm run cursor:hooks:repair`（または `cursor:registry`）— WSL なら Windows Cursor 用も更新
2. Cursor を **全ウィンドウ完全終了**して再起動（Reload だけでは足りないことあり）
3. まだダメなら `Developer: Reload Window`、緊急時は `%USERPROFILE%\.cursor\hooks.json` を一時リネーム

| 環境変数 | 意味 |
|---------|------|
| `COSTGATE_HOOKS_WINDOWS=0` | WSL から Windows hooks への同時書き込みを無効化 |
| `COSTGATE_WINDOWS_HOOKS_PATH` | Windows hooks.json の明示パス（WSL から見える `/mnt/c/...`） |
| `COSTGATE_HOOKS_FAIL_CLOSED=1` | hooks.json の failClosed を再有効化（非推奨） |

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
