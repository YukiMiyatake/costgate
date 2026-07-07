# @costgate/cli

CostGate の **npm 入口パッケージ**。Go 製 `costgate-gate` バイナリを GitHub Releases から取得し、Dashboard・Cursor Hooks と合わせて配布します。

> **言語:** [English](README.md) · 日本語（このファイル）

## クイックスタート

```bash
npx @costgate/cli@latest init
# Cursor を再起動（MCP 再接続）
```

`init` が行うこと:

1. `costgate-gate` を `~/.costgate/bin/` に配置（GitHub Releases から取得）
2. `~/.costgate/backends.json` テンプレート作成（未存在時）
3. `~/.cursor/mcp.json` を本番モード（`npx @costgate/cli gate`）に更新
4. `~/.cursor/hooks.json` に Shield / prompt-intent 等をマージ

## コマンド

| コマンド | 説明 |
|----------|------|
| `costgate init` | 初回セットアップ一式 |
| `costgate gate` | Cursor MCP エントリ（Dashboard 自動起動 + Gate） |
| `costgate dashboard` | Dashboard 手動起動 |
| `costgate registry` | Cursor Hooks のみ再登録 |
| `costgate update` | Gate バイナリ再取得 + mcp.json 更新 + hooks 更新 |
| `costgate shield sanitize-prompt` | プロンプトサニタイズ（CLI） |

## 配布モデル

| 層 | 配布 | 備考 |
|----|------|------|
| **Gate** | GitHub Releases（Go バイナリ） | `init` / `update` / `gate` 起動時に CLI と同版を取得 |
| **CLI** | npm（本パッケージ） | runtime に scripts / catalog を同梱 |
| **Probe** | npm `@costgate/probe` | 計測専用（別パッケージ） |

`costgate gate` 起動時は `~/.costgate/bin/` の Gate が CLI 版と一致するか確認し、古ければ GitHub Releases から再取得します。`npm update -g @costgate/cli` 後は `costgate update` を実行してください（Gate + `mcp.json` の `@costgate/cli@x.y.z` ピンを更新）。

## 開発（monorepo）

```bash
npm run build -w @costgate/cli
node packages/cli/bin/costgate.mjs init --force-gate
```

clone 時は `packages/gate/bin/costgate-gate` があればダウンロードをスキップします。

## 環境変数

| 変数 | 説明 |
|------|------|
| `COSTGATE_BIN_DIR` | Gate バイナリ配置先（既定 `~/.costgate/bin`） |
| `COSTGATE_RUNTIME_ROOT` | runtime ルート（自動設定） |
| `COSTGATE_GATE_BIN` | Gate バイナリパス（自動設定） |
