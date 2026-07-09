# 開発者向けドキュメント

> **言語:** [English](../dev/README.md) · 日本語（このファイル）

CostGate の **実装・設計・内部仕様** をまとめます。利用者向けの手順や概要は [`docs/`](../) 直下を参照してください。

| ドキュメント | 内容 |
|-------------|------|
| [dashboard.md](./dashboard.md) | MCP Dashboard — API、データソース、フェーズ別実装仕様 |
| [prompt-intent-hook.md](./prompt-intent-hook.md) | Phase 28 — 会話から Gate intent を事前推定する Hook 設計 |
| [shield-trust.md](./shield-trust.md) | Phase 31+ — Shield（隠匿）・MCP Trust・タスク一覧 |
| [ai-issues.md](./ai-issues.md) | Issue 駆動 AI 実行 — ラベル・認可・バッチ（6h / 3 件） |
| [../structure.md](../structure.md) | リポジトリ構成 |
| [../log-schema.md](../log-schema.md) | JSONL イベントスキーマ |
| [../architecture.md](../architecture.md) | Probe / Gate / Cursor 配置 |
| [../roadmap.md](../roadmap.md) | 実装フェーズ一覧 |

## ドキュメントの分離方針

| 種別 | 置き場所 | 読者 | 例 |
|------|---------|------|-----|
| **利用者向け** | `docs/*.md` | CostGate ユーザー | [dashboard.md](../dashboard.md), [RELEASE.md](../RELEASE.md) |
| **開発者向け** | `docs/dev/*.md` | コントリビュータ・実装者 | API 仕様、スコアリング式、未決事項 |

利用者向けドキュメントに内部実装の詳細を書かない。開発者向けから利用者向けへリンクは張る（逆も可）。
