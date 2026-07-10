# アーキテクチャ

> **言語:** [English](../architecture.md) · 日本語（このファイル）

## 目標構成（Cursor）

```
Cursor mcp.json
├── costgate-probe      … 計測用 MCP プロキシ（開発時）
└── costgate-gate       … フィルタ済みバックエンド（本番）
```

バックエンド（GitHub MCP 等）は `~/.costgate/backends.json` に定義し、Probe / Gate がプロキシします。`mcp.json` にバックエンドを直結しません。

## 役割

| コンポーネント | 目的 |
|---|---|
| **Probe** | バックエンド計測プロキシ。JSONL ログ出力 |
| **Gate** | 本番プロキシ — `tools/list` をフィルタ、`tools/call` を委譲 |

## 日常開発

```
Cursor
└── costgate-probe   … GitHub 計測（任意 · PAT 要）
         │
         └── GitHub MCP（子プロセス）
```

## 全体像

```
Cursor ─────────────┼── costgate-probe ────── GitHub MCP（計測）
                    └── costgate-gate ─────── GitHub MCP（本番）
```

## Probe（計測）

- 設定済みバックエンド向け stdio プロキシ（GitHub 等）
- ログ: `~/.costgate/logs/`

## Gate（本番）

- 委譲バックエンドの `tools/list` を Tier A/B/C + メタツールでフィルタ
- 非露出ツールは `discover_tools` / `invoke_tool` でオンデマンド利用
- 使用量: `~/.costgate/usage.json`（Probe JSONL があれば取り込み）

## Dashboard（Phase 23+）

- ローカル Web UI: `npm run dashboard` → `http://127.0.0.1:8787`
- Probe/Gate ログ・usage・`mcp.json` を参照 — [dashboard.md](./dashboard.md)
- 開発者仕様: [dev/dashboard.md](./dev/dashboard.md)

## Cloud（非公開 — costgate-cloud repo）

- 任意のメトリクスアップロード（オプトイン）
- Pro / Enterprise 向けレポート・サポート
