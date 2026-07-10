# Issue 駆動 AI 実行（設計）

> **言語:** [English](./ai-issues.md) · 日本語（このファイル）

> **スコープ — 製品機能ではない**  
> 本ドキュメントは **CostGate リポジトリ自身の開発**（`YukiMiyatake/costgate`）専用。  
> **メンテナのみ**が使う自動化（この repo の Issue → AI → PR）。  
> **CostGate OSS 製品**でも **LoopGate Cloud** でもなく、**顧客 repo 向けテンプレートでもない**。

**このリポジトリ**向け、**メンテナのみ**が起動できる Issue → AI 実装 → PR の設計書。  
ワークフロー実装は段階的に行う。本ドキュメントが契約（仕様）となる。

| 項目 | 決定 |
|------|------|
| **起動できる人** | **`YukiMiyatake` のみ**（ラベル/コメント時の `github.actor`）。`MEMBER` や外部コントリビュータは **不可**。 |
| **既定 Executor** | **Cursor**（Cloud Agent 等） |
| **代替 Executor** | **Claude API**（ラベルで選択） |
| **即時キュー** | ラベル `ai:run` |
| **バッチキュー** | ラベル `ai:batch` — **6 時間**に 1 回、最大 **3 Issue** |
| **AI の責務** | PR 作成まで。**CI / レビュー / auto-merge** は GitHub Actions（[CONTRIBUTING.md](../../CONTRIBUTING.md)） |

---

## 1. 目的と非目的

### 目的

- スコープが決まった Issue からテスト付き PR を作る。**全 Issue 自動実行はしない。**
- 同一ラベル体系で **即時** と **コスト重視のバッチ** を両立。
- **Cursor / Claude** をラベルで切り替え。
- 将来の **トリアージエージェント**（Issue 分割）を同じ認可の下に載せる余地を残す。

### 非目的（初期）

- `issues.opened` での自動起動。
- 不特定ユーザーの Issue 本文をそのまま信頼。
- AI PR のデフォルト auto-merge（後からラベルで有効化可）。
- costgate-cloud キュー本体（任意で後追い）。

---

## 2. 認可

パブリック repo では **「ラベルがある」だけでは起動しない**。必ず **誰が武装したか** を検証する。

### 許可される武装

**`github.actor == 'YukiMiyatake'`** のときのみ:

- キューラベル `ai:run` / `ai:batch` の付与
- Executor ラベル `ai:cursor` / `ai:claude` の付与
- コメント `/ai run` / `/ai batch`（任意。Bot がラベルに反映）
- AI 用 workflow の `workflow_dispatch`

**不可:** `MEMBER`、`CONTRIBUTOR`、フォーク経由の secrets 付き workflow、`issues.opened`。

### 定期バッチ（cron）

`schedule` には人間の `actor` がない。安全策:

1. 対象は **`ai:batch` が付いている Issue のみ**。
2. 武装は **`YukiMiyatake` がラベルを付けた記録**（Issue コメント）があるものに限定。
3. 将来: costgate-cloud から `repository_dispatch`（secret）のみ許可。

### 武装の監査コメント

武装時に Bot が残す（将来 workflow）:

```markdown
<!-- costgate-ai-armed:v1 -->
actor: YukiMiyatake
queue: batch
executor: cursor
armed_at: 2026-07-09T02:00:00Z
```

---

## 3. ラベル

### キュー（どちらか一方）

| ラベル | 意味 |
|--------|------|
| `ai:run` | **即時**実行（1 Issue = 1 ラン）。 |
| `ai:batch` | **6 時間**ごとのバッチ待ち。1 回あたり最大 **3 Issue**。 |

同時付与は不可。workflow は fail closed でコメント。

### Executor（任意・省略時 Cursor）

| ラベル | 意味 |
|--------|------|
| `ai:cursor` | **Cursor**（省略時の既定） |
| `ai:claude` | **Claude API**（`ai:batch` 時は Batch API 検討） |

Executor ラベルが二重なら fail closed。

```
executor = ai:claude があれば claude、なければ cursor
```

### 状態（Bot 管理）

| ラベル | 意味 |
|--------|------|
| `ai:running` | 実行中 |
| `ai:pr-open` | PR 作成済み |
| `ai:done` | マージ完了等 |
| `ai:failed` | 失敗 |
| `ai:blocked` | 人手が必要 |

### 例

| ラベル | 動作 |
|--------|------|
| `ai:batch` | 6h 以内のバッチ、Cursor |
| `ai:batch` + `ai:claude` | 6h バッチ、Claude |
| `ai:run` | 即時 Cursor |
| `ai:run` + `ai:claude` | 即時 Claude |

---

## 4. Issue 指示ブロック

メンテナが編集する機械可読ブロック:

```markdown
<!-- costgate-ai:v1 -->
queue: batch
executor: claude
scope:
  - scripts/lib/prompt-history.mjs
test:
  - npm run test:ci
constraints:
  - Do not change release version
notes: |
  correlation ラベルのみ修正。
```

スコープとテストは **このブロックのみ** 信頼する。

---

## 5. 実行フロー

### 即時（`ai:run`）

1. `issues.labeled` → `github.actor == 'YukiMiyatake'` かつ `ai:run`。
2. Executor 解決（`cursor` | `claude`）。
3. `ai:running` → Executor 起動 → `feat:start` → 実装 → テスト → `feat:ship`（PR のみ）。
4. PR URL コメント、`ai:pr-open`。

### バッチ（`ai:batch`）

| パラメータ | 値 |
|-----------|-----|
| cron | `0 */6 * * *`（UTC、6 時間ごと） |
| 1 回の最大件数 | **3** |
| 順序 | 武装が古い順 |
| 除外 | `ai:running` / `ai:pr-open` / `ai:done` |

`ai:claude` + バッチは **Claude Message Batches API** を優先（ドキュメント・テスト中心タスク）。

手動で今すぐバッチ: `ai-batch.yml` の `workflow_dispatch`（メンテナのみ）。

---

## 6. Executor

### Cursor（既定）

- 複数ファイル、Gate / Dashboard、統合テスト向き。
- `feat:ship`・既存 Hook と整合。

### Claude（`ai:claude`）

- スコープが明確な小タスク（doc、テスト、単一モジュール）。
- バッチ + Claude Batch API でコスト削減。
- 成果物は必ず **branch + PR**（`main` 直 push なし）。

---

## 7. PR / CI

| ルール | 値 |
|--------|-----|
| ブランチ | `ai/issue-<num>-<slug>` |
| PR タイトル | `[ai] #<num> <概要>` |
| マージ | 既存 CI。AI PR は初期 **auto-merge OFF** 推奨 |

---

## 8. 将来: トリアージエージェント

Issue 分割・`costgate-ai:v1` 提案は可能。**実行ラベルはメンテナが付ける**か、専用 GitHub App を別途許可リストに載せる。

---

## 9. 実装フェーズ

| Phase | 内容 |
|-------|------|
| **A**（本ドキュメント） | ラベル契約・認可 |
| **B** | `ai-run.yml` |
| **C** | `ai-batch.yml`（6h / 3 件） |
| **D** | Cursor dispatch |
| **E** | Claude / Batch API |
| **F** | costgate-cloud 連携 |

---

## 10. 関連

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [shield-trust.md](./shield-trust.md)
- [roadmap.md](../roadmap.md)
