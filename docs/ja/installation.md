# インストールガイド

> **言語:** [English](../installation.md) · 日本語（このファイル）

CostGate は **npm CLI**（`@costgate/cli`）と **Go 製 Gate バイナリ**（GitHub Releases）で配布されます。  
**Cursor** が最もサポートが充実（MCP + hooks + Dashboard）です。他の MCP クライアントは Gate 単体で利用できます。

## 対応プラットフォーム

| プラットフォーム | Gate | CLI | Cursor hooks | Dashboard | 備考 |
|------------------|:----:|:---:|:------------:|:---------:|------|
| **Linux（ネイティブ）** | ✅ | ✅ | ✅ | ✅ | 開発向け推奨 |
| **WSL2** | ✅ | ✅ | ✅ | ✅ | リポジトリが `/mnt/c` や `/e` 上なら `npm run cursor:deps` |
| **macOS** | ✅ | ✅ | ✅ | ✅ | 初回 Gatekeeper 警告時はバイナリを許可 |
| **Windows（ネイティブ）** | ✅ | ✅ | ✅ | ✅ | Git Bash / PowerShell、`%USERPROFILE%\.cursor` |
| **Claude Desktop** | ✅ | ✅ | ❌ | 任意 | Gate MCP のみ（Shield hooks なし） |
| **VS Code / その他 MCP** | ✅ | 一部 | ❌ | 任意 | stdio MCP のみ |

要件: CLI/Dashboard は **Node.js 20+**。エンドユーザーに Go は不要（`costgate init` がバイナリを取得）。

---

## Cursor（推奨）

### エンドユーザー（npm 公開後）

```bash
npx @costgate/cli@latest init
# Cursor MCP を再起動
```

設定内容:

- `~/.cursor/mcp.json` — `costgate-gate`
- `~/.cursor/hooks.json` — Shield / prompt-intent 等
- `~/.costgate/bin/costgate-gate`
- `~/.costgate/backends.json`（未存在時）

### 開発者（リポジトリ clone）

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build:gate
mkdir -p ~/.costgate && cp examples/backends.github.json ~/.costgate/backends.json
npm run cursor:deps
npm run cursor:production
npm run cursor:registry
# Cursor MCP を再起動
```

[examples/cursor/README.ja.md](../examples/cursor/README.ja.md) 参照。

### WSL2 / DrvFs

リポジトリが Windows マウント（`/mnt/c/...`、`/e/...`）上にあると `node_modules` が**壊れる**ことがあります。

- MCP が起動しない
- `dashboard failed to become ready`
- `@modelcontextprotocol/sdk` や `js-tiktoken` の `SyntaxError`

**対処:**

```bash
npm run cursor:deps
npm run cursor:production
```

Dashboard 用依存を Linux 側の `~/.costgate/node_modules` に入れます。

---

## Claude Desktop

**Gate** は stdio MCP として動作します。**Shield hooks は Cursor 専用**です。

1. Gate を導入:

```bash
npx @costgate/cli@latest init
```

2. [examples/claude-desktop/mcp-gate.json](../examples/claude-desktop/mcp-gate.json) を Claude Desktop の MCP 設定にマージ。

| OS | 設定ファイル |
|----|-------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

3. `COSTGATE_CONFIG` を `~/.costgate/backends.json` に設定。
4. Claude Desktop を再起動。

ツール一覧のフィルタは `COSTGATE_GATE_MODE=filter` を MCP の `env` に追加。[gate-mode.md](./gate-mode.md) 参照。

---

## Windows（ネイティブ）

1. [Node.js 20+](https://nodejs.org/) をインストール
2. [Cursor](https://cursor.com/) をインストール
3. PowerShell または Git Bash で:

```bash
npx @costgate/cli@latest init
```

パス:

- MCP: `%USERPROFILE%\.cursor\mcp.json`
- データ: `%USERPROFILE%\.costgate\`

---

## macOS

Linux と同様。Gate バイナリがブロックされた場合:

```bash
xattr -d com.apple.quarantine ~/.costgate/bin/costgate-gate 2>/dev/null || true
```

---

## Linux

```bash
npx @costgate/cli@latest init
```

任意: `~/.local/bin` へ Gate を配置:

```bash
./scripts/install-gate.sh
```

---

## 動作確認

```bash
costgate-gate --version
npm run cursor:mcp -- status   # clone 時
```

Cursor: **Settings → MCP** で `costgate-gate` が接続されていること。

---

## 関連ドキュメント

- [releases.md](./releases.md)
- [gate-mode.md](./gate-mode.md)
- [dashboard.md](./dashboard.md)
- [dev/shield-trust.md](./dev/shield-trust.md)
