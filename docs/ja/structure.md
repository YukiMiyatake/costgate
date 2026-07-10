# リポジトリ構成

> **言語:** [English](../structure.md) · 日本語（このファイル）

CostGate OSS は **モノレポ** です。Gate（Go バイナリ）と npm エントリ層（`@costgate/cli`）が同一リポジトリにあります。

```
costgate/
├── packages/
│   ├── schema/          @costgate/schema   — 共有ログスキーマ（npm・内部）
│   ├── probe/           @costgate/probe    — 計測 MCP（npm 公開）
│   ├── cli/             @costgate/cli     — npm エントリ（起動・Dashboard・hooks）
│   └── gate/            costgate-gate      — ゲートウェイ MCP（Go・goreleaser）
├── catalog/marketplace/ MCP カタログ（CLI runtime に同梱）
├── docs/
├── examples/
├── scripts/             開発用（publish 時は packages/cli/runtime にコピー）
└── package.json         npm workspaces ルート（private）
```

## 配布モデル

| 層 | 公開 | ユーザー入口 |
|-------|---------|------------|
| **Gate** | GitHub Releases（`costgate-gate_*`） | `@costgate/cli init` がダウンロード |
| **CLI** | npm `@costgate/cli` | `npx @costgate/cli init` |
| **Probe** | npm `@costgate/probe` | 計測時のみ `npx @costgate/probe` |

## モノレポにする理由

| 懸念 | 回答 |
|---------|--------|
| npm で `@costgate/cli` / `@costgate/probe` を公開 | モノレポの `packages/*` から可能 |
| Gate の Go バイナリ | 同一 repo の `packages/gate` からビルド |
| Dashboard / hooks を npm に | `packages/cli` の build が `scripts/` + `catalog/` をコピー |
| バージョン同期 | タグ `v*` 一つで Gate バイナリ + schema + probe + cli |

Gate は goreleaser で GitHub Releases。npm は同一タグで `npm-publish.yml` から公開。

## 関連リポジトリ

| Repo | 役割 |
|------|------|
| [costgate](.) | OSS — Probe + Gate + CLI（**CostGate エンジン**） |
| [costgate-cloud](../costgate-cloud) | 非公開 — **LoopGate** SaaS（ループ・ゲートウェイ・課金） |

## エコシステム（LoopGate）

| プロダクト | Repo | 公開 |
|---------|------|--------|
| **CostGate** | `costgate`（本 repo） | Yes — MCP ゲートウェイ、Shield、ローカル Dashboard |
| **LoopGate** | `costgate-cloud` | No — Hosted LoopOps、LLM プロキシ、組織ポリシー |

- OSS は **エンジン**（`costgate init`、Gate MCP、hooks）。
- SaaS は **Issue → PR ループ** をホスト Claude API で実行（costgate-cloud `docs/product/loopgate.md` 参照）。
- **機能分割（OSS 無料 vs Cloud 有料）:** [ecosystem/plans.md](./ecosystem/plans.md)
- OSS と cloud を **1 repo にマージしない**（ライセンス・リリース頻度・公開範囲が異なる）。

詳細レイアウト: costgate-cloud `docs/repository-structure.md`。
