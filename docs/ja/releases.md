# CostGate 配布と Gate リリース

> **言語:** [English](../releases.md) · 日本語（このファイル）

## 推奨インストール（`@costgate/cli`）

Gate バイナリ + Dashboard + Cursor hooks を **1 コマンド**で:

```bash
npx @costgate/cli@latest init
# Cursor MCP を再起動
```

| コマンド | 説明 |
|---------|------|
| `costgate init` | 一式セットアップ |
| `costgate gate` | MCP エントリ（Cursor が npx 経由で起動） |
| `costgate update` | Gate 再取得 + `mcp.json` バージョン更新 + hooks 更新 |
| `costgate registry` | hooks のみ |

グローバル: `npm install -g @costgate/cli && costgate init`

詳細: [packages/cli/README.ja.md](../../packages/cli/README.ja.md)

---

## Gate バイナリ（GitHub Releases）

`costgate-gate` は **Go バイナリ**。`@costgate/cli init` が `~/.costgate/bin/` に自動配置します。

手動インストール:

```bash
./scripts/install-gate.sh              # 最新 → ~/.local/bin
./scripts/install-gate.sh v0.6.0       # 特定 tag
```

確認: `costgate-gate --version`

### 対応プラットフォーム

linux / darwin / windows × amd64 / arm64  
アセット名: `costgate-gate_{version}_{os}_{arch}.{tar.gz|zip}`

---

## メンテナ: リリース

```bash
git tag v0.6.0 && git push origin v0.6.0
```

| Workflow | 成果物 |
|----------|--------|
| `release.yml` | Gate バイナリ |
| `npm-publish.yml` | `@costgate/schema`, `@costgate/probe`, `@costgate/cli` |

`NPM_TOKEN` シークレットが必要です。

---

## npm パッケージ

| パッケージ | 用途 |
|-----------|------|
| `@costgate/cli` | 本番入口 |
| `@costgate/probe` | 計測専用 |

---

## Cursor 設定の選択肢

- **A — CLI（推奨）:** `npx @costgate/cli init`
- **B — バイナリのみ:** [mcp-gate-github.json](../../examples/cursor/mcp-gate-github.json)
- **C — clone 開発者:** `npm run cursor:production`
