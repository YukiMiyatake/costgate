# CostGate と LoopGate — プラン（機能分割）

> **言語:** [English](../ecosystem/plans.md) · 日本語（このファイル）  
> **詳細版（private）:** costgate-cloud `docs/product/feature-matrix.md`  
> **OSS ロードマップ:** [roadmap.md](../roadmap.md) · **エコシステム:** [structure.md](../structure.md#エコシステムloopgate)

2 つのプロダクト、1 つのエンジン:

| プロダクト | 価格 | 実行場所 |
|---------|-------|---------------|
| **CostGate** | **無料（MIT OSS）** | ローカル — Cursor MCP ゲートウェイ |
| **LoopGate** | **有料 SaaS**（Starter 無料枠予定） | AWS ホスト — LoopOps ループ |

---

## CostGate OSS — 常に無料

以下は公開 [costgate](https://github.com/YukiMiyatake/costgate) リポジトリで MIT のまま提供します。

| カテゴリ | 機能 | 状態 |
|----------|----------|--------|
| **MCP ゲートウェイ** | Gate フィルタ（Tier A/B/C）、`discover_tools`、圧縮、code-mode、動的 intent | ✅ |
| **計測** | Probe MCP、JSONL ログ、`session-report`、`compare`、tiktoken 推定 | ✅ |
| **CLI・インストール** | `npx @costgate/cli init`、Gate バイナリ（GitHub Releases）、Cursor hooks | ✅ |
| **ローカル Dashboard** | 使用量・削減見積もり、MCP ON/OFF、マーケットプレイス、プロジェクト別設定 | ✅ |
| **品質** | eval スイート、benchmark CI、マルチ MCP カタログ | ✅ |
| **セキュリティ（予定）** | Shield 隠匿、MCP trust、プロンプト秘密ブロック | 🔜 Phase 31+ |
| **Issue 駆動 AI（OSS）** | ラベル契約（`ai:run`、`ai:batch`）、メンテナのみ武装 | ✅ ドキュメント · 🔜 workflows |

**OSS に含まれないもの:** ホスト型 Issue→PR ループ、自前キーなしのホスト Claude API、チーム課金、クラウド監査 UI。

---

## LoopGate Cloud — 有料機能

非公開 **costgate-cloud** リポジトリの商用プラットフォーム。**Powered by CostGate.**

| Tier | 対象 | 主な追加機能 | 状態 |
|------|--------|---------------|--------|
| **Starter** | OSS からのアップグレード | 限定ホストループ、クラウドメトリクス、ローカル Gate のみ | 🔜 metrics ✅ |
| **Pro** | 小規模チーム | ホスト Gateway + Runner、Console、チームポリシー、90 日監査 | 🔜 |
| **Enterprise** | 大企業 | RBAC、BYOK、VPC runner、SIEM、契約時 Azure | 🔜 |

### Cloud のみの機能（OSS にない）

| 機能 | Starter | Pro | Enterprise |
|---------|:-------:|:---:|:----------:|
| Hosted Runner（Issue → PR） | 限定 | ✅ | ✅ |
| Hosted LLM Gateway（Claude プロキシ） | — | ✅ | ✅ + BYOK |
| LoopGate Console（`apps/web`） | — | ✅ | ✅ |
| 組織 / チームポリシー | — | ✅ | RBAC |
| クラウド監査ログ | — | 90 日 | 長期 + SIEM |
| CI 自己修復（retry 上限） | — | ≤2 | カスタム |
| Stripe 課金 | — | ✅ | volume / seat |
| バッチキュー（6h、最大 3 Issue） | — | ✅ | ✅ |

### ブリッジ（オプトイン、無料 OSS と併用可）

| 機能 | 説明 | 状態 |
|---------|-------------|--------|
| `npm run cloud:upload` | **集約**メトリクスサマリのみ送信 — ソースコードなし | ✅ |
| Local Reporter | Probe JSONL から Markdown（`costgate-cloud` reporter） | ✅ |

---

## クイック判断

| やりたいこと | 使うもの |
|-----------|-----|
| Cursor で MCP トークンコストを下げる | **CostGate OSS**（無料） |
| 使用量をローカルで見る | **CostGate Dashboard**（無料） |
| Claude キー管理なしでクラウド Issue→PR ループ | **LoopGate Pro**（有料） |
| チームポリシー + クラウド監査 | **LoopGate Pro**（有料） |
| BYOK / VPC / Azure デプロイ | **LoopGate Enterprise**（有料） |

---

## 関連

- [リポジトリ構成 — エコシステム](../structure.md#エコシステムloopgate)
- [Issue 駆動 AI 設計](../dev/ai-issues.md)
- [MCP Dashboard（利用者）](../dashboard.md)
- LoopGate プロダクト（private）: costgate-cloud `docs/product/loopgate.md`

---

## 改訂履歴

| 日付 | 変更 |
|------|--------|
| 2026-07-10 | costgate-cloud feature-matrix に合わせた公開要約の初版 |
