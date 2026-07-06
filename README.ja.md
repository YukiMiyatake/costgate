# CostGate

**Gate your MCP. Cut your bill.**

CostGate は MCP ツール定義とレスポンスを最適化し、AI のトークン消費を削減します。  
Cursor 向けに設計され、Claude Desktop など他の MCP クライアントとも互換です。

> **言語:** [English](README.md) · 日本語（このファイル）

## リポジトリ構成（monorepo）

```
costgate/
├── packages/
│   ├── schema/     @costgate/schema   — 共有ログスキーマ
│   ├── probe/      @costgate/probe    — 計測 MCP（npm）
│   ├── cli/        @costgate/cli      — npm 入口（ランチャー、Dashboard、hooks）
│   └── gate/       costgate-gate      — ゲートウェイ MCP（Go バイナリ）
├── docs/
├── examples/
└── scripts/
```

[docs/structure.md](./docs/structure.md) に Probe と Gate を同一リポジトリに置く理由を記載しています。

## パッケージ

| パッケージ | 配布 | 説明 |
|-----------|------|------|
| [@costgate/cli](./packages/cli/) | npm | **推奨入口** — `init`、Gate ランチャー、Dashboard、Cursor hooks |
| [@costgate/probe](./packages/probe/) | npm | 計測 MCP — ベースライン計測、JSONL ログ |
| [costgate-gate](./packages/gate/) | GitHub Releases | ゲートウェイ MCP（Go）— フィルタ、Shield、コスト削減 |
| [@costgate/schema](./packages/schema/) | workspace | ログ用 JSON Schema |

## クイックスタート（本番・推奨）

**Node のみ**で導入できます（Go のビルド不要）。`init` が GitHub Releases から Gate バイナリを取得します。

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

詳細: [packages/cli/README.ja.md](./packages/cli/README.ja.md) · [docs/ja/releases.md](./docs/ja/releases.md)

### グローバルインストール（任意）

```bash
npm install -g @costgate/cli
costgate init
```

## クイックスタート（開発者・リポジトリ clone）

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build:gate          # または ./scripts/install-gate.sh
cp examples/backends.github.json ~/.costgate/backends.json
npm run cursor:production   # ローカルパスで mcp.json 更新
npm run cursor:registry     # hooks 登録
```

Docker のみ: [docs/ja/docker.md](./docs/ja/docker.md)

## クイックスタート（Probe — 計測のみ）

### npx（公開版）

```bash
npx @costgate/probe@latest
```

Cursor `~/.cursor/mcp.json` に追加:

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

### ソースから

```bash
npm install
npm run build:probe
```

計測設定: [examples/cursor/README.ja.md](./examples/cursor/README.ja.md)

## Gate（上級者向け・バイナリのみ）

Dashboard / Hooks なしの最小構成:

```bash
./scripts/install-gate.sh          # → ~/.local/bin/costgate-gate
costgate-gate --version
```

`~/.cursor/mcp.json` 例: [examples/cursor/mcp-gate-github.json](./examples/cursor/mcp-gate-github.json)

リポジトリからビルド: `npm run build:gate`（Go 1.25+）

Releases: [GitHub Releases](https://github.com/YukiMiyatake/costgate/releases) · [docs/ja/RELEASE.md](./docs/ja/RELEASE.md)

**Filter モード（既定）:** Tier A/B/C + `discover_tools` / `invoke_tool`。詳細は [packages/gate/README.md](./packages/gate/README.md)。

削減比較: `npm run compare` · `npm run compress-report` · `npm run session-report`

ベンチマーク: [docs/benchmarks.md](./docs/benchmarks.md)

本番 Cursor 設定（clone）: `npm run cursor:production` — [examples/cursor/README.ja.md](./examples/cursor/README.ja.md)

クラウドメトリクス（任意）: `npm run cloud:upload` — [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud)

## プラン（ロードマップ）

| プラン | 範囲 |
|--------|------|
| **Free (OSS)** | Probe + Gate + Dashboard — Phase 16–33 ✅ |
| **Pro** | ホスト型 Dashboard — Phase 30+ |
| **Team** | Billing / policies — 後回し |

詳細: [docs/roadmap.md](./docs/roadmap.md)

## ドキュメント

- [多言語ドキュメント](./docs/i18n.md)
- [開発ロードマップ](./docs/roadmap.md)
- [MCP Dashboard（利用者向け）](./docs/ja/dashboard.md) · [English](./docs/dashboard.md)
- [MCP トークン削減調査](./docs/mcp-reduction-survey.md)
- [MCP Dashboard（開発者向け）](./docs/dev/dashboard.md)
- [ベンチマーク](./docs/benchmarks.md)
- [リポジトリ構成](./docs/structure.md)
- [Docker](./docs/ja/docker.md)
- [Gate リリース](./docs/ja/releases.md)
- [アーキテクチャ](./docs/architecture.md)
- [ログスキーマ](./docs/log-schema.md)
- [コントリビューション](./docs/ja/CONTRIBUTING.md)

## ライセンス

MIT — [LICENSE](./LICENSE)
