# 日本語ドキュメント

CostGate のドキュメント（日本語）索引です。  
英語版は [`docs/`](../) 直下が正本です。対応表は [i18n.md](../i18n.md) を参照してください。

## はじめに

- [README.ja.md](../../README.ja.md) — プロジェクト概要・クイックスタート

## 利用者向け

| ドキュメント | 内容 |
|-------------|------|
| [dashboard.md](./dashboard.md) | MCP Dashboard（利用者向け） |
| [releases.md](./releases.md) | 配布・Gate リリース・インストール |
| [RELEASE.md](./RELEASE.md) | メンテナ向けリリース手順 |
| [docker.md](./docker.md) | Docker / Dev Container |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | コントリビューション |
| [architecture.md](./architecture.md) | Probe / Gate / Cursor 配置 |
| [structure.md](./structure.md) | リポジトリ構成・エコシステム |
| [log-schema.md](./log-schema.md) | JSONL イベントスキーマ |
| [roadmap.md](./roadmap.md) | 実装フェーズ一覧 |
| [benchmarks.md](./benchmarks.md) | ベンチマーク・検証データ |
| [mcp-reduction-survey.md](./mcp-reduction-survey.md) | MCP 削減調査 |
| [ecosystem/plans.md](./ecosystem/plans.md) | CostGate OSS vs LoopGate Cloud 機能分割 |

## 開発者向け

| ドキュメント | 内容 |
|-------------|------|
| [dev/README.md](./dev/README.md) | 開発者向けドキュメント索引 |
| [dev/dashboard.md](./dev/dashboard.md) | MCP Dashboard 実装仕様 |
| [dev/shield-trust.md](./dev/shield-trust.md) | Shield・MCP Trust 設計 |
| [dev/ai-issues.md](./dev/ai-issues.md) | Issue 駆動 AI 実行 |
| [dev/prompt-intent-hook.md](./dev/prompt-intent-hook.md) | Prompt Intent Hook 設計 |
| [dev/optimize-sweep.md](./dev/optimize-sweep.md) | 最適設定探索・LLM judge 企画 |
| [dev/prompt-history.md](./dev/prompt-history.md) | Dashboard 履歴タブ企画 |

## パッケージ・例

- [@costgate/cli README.ja.md](../../packages/cli/README.ja.md)
- [Cursor 設定例](../../examples/cursor/README.ja.md)

## 英語のみ（意図的）

| ドキュメント | 理由 |
|-------------|------|
| [CHANGELOG.md](../../CHANGELOG.md) | リリースノート（英語標準） |
| `packages/gate` / `probe` / `schema` README | 低トラフィックな API 参照 |
