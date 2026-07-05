# Phase 28 — Prompt Intent Hook（設計）

会話内容から Gate の **Tier B 露出 intent** を事前推定する Cursor Hook 連携の設計書。

| 項目 | 内容 |
|------|------|
| **目的** | ユーザーがプロンプト送信直後に、使われそうな MCP ツール群を Gate `tools/list` に早めに露出する |
| **非目的** | MCP の自動インストール、プロンプト改変、Cloud Agent 対応（初期） |
| **前提** | Gate filter mode、Phase 8/22 intent、Phase 27 project recommend が稼働 |

---

## 1. 背景と課題

### 現状の intent ソース（事後中心）

```
COSTGATE_INTENT (env, 静的)
    +
Probe JSONL 直近 tool_call 名     ← ツール実行後
    +
usage.json 直近 tool 名           ← ツール実行後
    ↓
intent.Resolve → MatchIntent → Tier B 露出
```

初回ターンや新トピックでは **Tier B が空のまま** `tools/list` され、Agent が `discover_tools` や Shell 迂回を選びやすい。

### Hook で足せるもの（事前）

| タイミング | 取得可能データ |
|-----------|---------------|
| `beforeSubmitPrompt` | 今回の `prompt` 全文、`attachments` |
| 共通フィールド | `conversation_id`, `generation_id`, `workspace_roots`, `transcript_path` |
| transcript（任意） | 過去ターン全文（JSONL、設定依存） |

**Hook JSON だけでは会話履歴全文は来ない。** transcript ファイル読取はオプション機能とする。

---

## 2. 目標

| # | 目標 | 成功指標 |
|---|------|---------|
| G1 | プロンプト送信 → 次の `tools/list` までに intent 反映 | 初回ターンで関連 Tier B が 1 件以上露出 |
| G2 | 既存 intent（probe / usage / env）と非破壊 merge | `intent.Resolve` 互換、既存テスト緑 |
| G3 | プライバシー・オプトアウト | transcript 読取は明示 opt-in |
| G4 | CostGate 既存 UX と統合 | `npm run cursor:registry` で一括インストール |

---

## 3. アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│ Cursor Agent Chat                                                │
└────────────┬────────────────────────────────────────────────────┘
             │ Enter
             ▼
┌────────────────────────────┐
│ beforeSubmitPrompt Hook    │  scripts/cursor-prompt-intent-hook.mjs
│  · prompt + attachments    │
│  · optional transcript tail│
│  · project signals (Phase27)│
└────────────┬───────────────┘
             │ write
             ▼
┌────────────────────────────┐
│ ~/.costgate/prompt-intent/   │
│   latest.json              │  ← 直近 generation の keywords
│   {conv_id}.jsonl (opt)    │  ← 監査用 append-only
└────────────┬───────────────┘
             │ read (each tools/list / syncTools)
             ▼
┌────────────────────────────┐
│ Gate intent.Resolve        │  + PromptIntentEnabled()
│  static + probe + usage   │
│  + prompt keywords (NEW)   │
└────────────┬───────────────┘
             ▼
       tools/list (Tier A + matched Tier B)
```

### なぜファイル経由か

Gate MCP プロセスは **stdio で長寿命**。`sessionStart` の env 注入は Gate 起動後のターン更新に効かない。Probe JSONL と同様、**Hook が書き、Gate が読む** パターンが既存と一致する。

---

## 4. コンポーネント設計

### 4.1 Hook — `scripts/cursor-prompt-intent-hook.mjs`

| 項目 | 値 |
|------|-----|
| イベント | `beforeSubmitPrompt` |
| matcher | `UserPromptSubmit`（任意・省略可） |
| timeout | 5s |
| failClosed | `false`（推定失敗でチャットを止めない） |
| 出力 | `{ "continue": true }` のみ（ブロック用途は将来） |

**処理フロー:**

1. stdin JSON パース
2. `inferPromptIntent(payload)` — キーワード抽出（§5）
3. `writePromptIntent(record)` — ファイル書込
4. stdout `{ "continue": true }`、exit 0

**registry hook との共存:** `install-cursor-registry-hook.mjs` を拡張し、同一 `hooks.json` に両方登録。または `install-cursor-hooks.mjs` に統合 rename（Phase 28 PR）。

### 4.2 推論ライブラリ — `scripts/lib/prompt-intent.mjs`

```javascript
/**
 * @typedef {Object} PromptIntentRecord
 * @property {string} conversation_id
 * @property {string} generation_id
 * @property {string} workspace_root
 * @property {string} keywords       // Gate MatchIntent 用スペース区切り
 * @property {string[]} templates   // 推定 MCP template id (github, slack, …)
 * @property {Object} scores        // template → 0..1
 * @property {string[]} sources     // prompt | attachment | transcript | project
 * @property {number} ts            // epoch ms
 */

export function inferPromptIntent(payload, options)
export function readTranscriptTail(transcriptPath, maxTurns)
export function writePromptIntent(record, options)
export function promptIntentPath(options)  // ~/.costgate/prompt-intent/latest.json
```

**単体テスト:** `test/prompt-intent.test.mjs` — 日本語/英語プロンプト、attachments、スコア閾値。

### 4.3 Gate 拡張 — `packages/gate/internal/intent/`

```go
// infer.go
func PromptIntentEnabled() bool {
    return env.Bool("COSTGATE_INTENT_PROMPT", true)
}

func Resolve(store *usage.Store, static string) string {
    // ... existing ...
    if PromptIntentEnabled() {
        if prompt := usage.RecentPromptIntentKeywords("", defaultWindow); prompt != "" {
            parts = append(parts, prompt)
        }
    }
    return strings.TrimSpace(strings.Join(parts, " "))
}
```

```go
// usage/promptintent.go
// RecentPromptIntentKeywords reads latest.json if ts within window (default 10m)
// and generation_id matches or conversation_id matches current session
```

| 環境変数 | 既定 | 説明 |
|---------|------|------|
| `COSTGATE_INTENT_PROMPT` | `1` | prompt intent ファイル読取 |
| `COSTGATE_PROMPT_INTENT_WINDOW` | `10m` | 有効期限 |
| `COSTGATE_PROMPT_INTENT_DIR` | `~/.costgate/prompt-intent` | 保存先 |

**MatchIntent との接続:** `keywords` 文字列は既存 `MatchIntent` にそのまま渡す（tool name / description の部分一致）。catalog `tags` を keywords に含める。

---

## 5. 推論エンジン（ルールベース v1）

LLM 分類は v2。v1 は **catalog/marketplace/*.json の tags + Phase 27 シグナル** で十分。

### 5.1 入力シグナルと重み

| ソース | 重み | 例 |
|--------|------|-----|
| `prompt` テキスト | 1.0 | 「PR 作って」→ github, pull, merge |
| `attachments` パス | 0.8 | `.github/` → github |
| `project signals` | 0.6 | go.mod → filesystem, github |
| `transcript` 直近 2 ターン | 0.4 | 前ターンで DB 言及 → postgres |

### 5.2 キーワード → template マップ（抜粋）

`catalog/marketplace/` の `tags` を機械生成で索引化し、以下を手動ブースト:

| パターン（正規表現 / 語） | templates | keywords 出力例 |
|--------------------------|-----------|----------------|
| `\b(pr\|pull request\|merge\|github\|issue)\b` | github | `github pull merge issue` |
| `\b(slack\|channel\|通知)\b` | slack | `slack chat notifications` |
| `\b(browser\|playwright\|screenshot\|e2e)\b` | browser, playwright | `browser playwright` |
| `\b(postgres\|sql\|database\|query)\b` | postgres, sqlite | `postgres database sql` |
| `\b(search\|google\|brave)\b` | brave-search, fetch | `search brave` |
| `\b(notion\|linear\|docker)\b` | 各 id | catalog tags |

### 5.3 スコアリング

```
score(template) = Σ (weight_source × match_strength)
```

- `match_strength`: 完全一致 1.0、部分 0.5、tag のみ 0.3
- 閾値 `≥ 0.5` の template の tags を `keywords` に union
- 上限: keywords 20 語（Gate MatchIntent のノイズ抑制）

### 5.4 project recommend 再利用

`detectProjectSignals(projectRoot)` を Hook 内で呼び、`SIGNAL_TEMPLATES` から弱シグナルとして加算。Dashboard Recommendations とは独立（intent は Gate 向け、recommend は UI 向け）。

---

## 6. ストレージスキーマ

### `latest.json`

```json
{
  "conversation_id": "conv-abc",
  "generation_id": "gen-xyz",
  "workspace_root": "/home/user/project",
  "keywords": "github pull merge issue",
  "templates": ["github"],
  "scores": { "github": 0.85 },
  "sources": ["prompt", "project"],
  "prompt_preview": "PR を作ってレビュー依頼して",
  "ts": 1717632000123
}
```

| フィールド | Gate が読む | 備考 |
|-----------|------------|------|
| `keywords` | ✅ | `MatchIntent` 入力 |
| `ts` | ✅ | TTL 判定 |
| `generation_id` | ✅ | 同一ターン優先 |
| `prompt_preview` | ❌ | Dashboard 表示用（先頭 80 文字、opt-in） |
| `templates`, `scores` | ❌ | デバッグ / Dashboard |

### プライバシー

| 設定 | 場所 | 既定 |
|------|------|------|
| Hook 有効 | `hooks.json` | install 時のみ |
| transcript 読取 | `COSTGATE_PROMPT_INTENT_TRANSCRIPT=0` | **OFF** |
| preview 保存 | `COSTGATE_PROMPT_INTENT_PREVIEW=0` | **OFF** |
| 監査 JSONL | `COSTGATE_PROMPT_INTENT_AUDIT=0` | OFF |

---

## 7. タイムライン（1 ターン）

```
T0  User: Enter
T1  beforeSubmitPrompt → write latest.json          (~5ms)
T2  Cursor → Agent loop start
T3  Agent → Gate tools/list
T4  Gate intent.Resolve reads latest.json (T1)
T5  Tier B 露出（例: create_pull_request, merge_pull_request）
T6  Agent tool_call → usage 記録 → 以降は既存 dynamic intent
```

**初回ターン問題:** T3 が T1 より前に走るレースは稀（Hook は backend リクエスト前）。万一の場合は次の `syncTools`（tool_call 後）で追従 — 既存 Phase 8 と同じ。

---

## 8. インストール・UX

```bash
npm run cursor:registry   # 拡張: registry + prompt-intent hooks
```

`~/.cursor/hooks.json` 追加例:

```json
{
  "beforeSubmitPrompt": [
    {
      "command": "node /path/to/costgate/scripts/cursor-prompt-intent-hook.mjs",
      "timeout": 5
    }
  ]
}
```

Dashboard（将来）:

- Overview に `prompt_intent_last` カード（keywords, templates, ts）
- Tools タブに「prompt 推定で露出」バッジ

---

## 9. テスト計画

| レイヤ | ファイル | 内容 |
|--------|---------|------|
| 推論単体 | `test/prompt-intent.test.mjs` | 日英プロンプト、閾値、上限 |
| Hook 単体 | `test/cursor-prompt-intent-hook.test.mjs` | stdin fixture → stdout + ファイル |
| Gate 統合 | `packages/gate/internal/intent/infer_prompt_test.go` | latest.json → Resolve merge |
| E2E eval | `test/eval/tasks.json` | 新 task `prompt_intent_exposes_pr_tools` |

**eval シナリオ例:**

1. seed `latest.json` with `keywords: "github pull merge"`
2. Gate filter mode `tools/list`
3. assert `create_pull_request` or similar in exposed set

---

## 10. フェーズ分割（PR 単位）

| PR | 内容 | 依存 |
|----|------|------|
| **28a** | `prompt-intent.mjs` + Hook + install + Node tests | なし |
| **28b** | Gate `RecentPromptIntentKeywords` + env + Go tests | 28a |
| **28c** | eval task + Dashboard 表示（任意） | 28b |
| **28d** | transcript tail opt-in（任意） | 28a |

---

## 11. リスクと対策

| リスク | 対策 |
|--------|------|
| 誤推定で Tier B 膨張 | スコア閾値 + keywords 上限；discover_tools は従来通り |
| transcript に秘密情報 | 既定 OFF、ドキュメントで明示 |
| Hook 遅延で UX 悪化 | 5s timeout、ルールのみ（v1 は LLM なし） |
| Linux workspaceOpen 未発火 | prompt hook は Agent セッション内で動作（registry 問題と独立） |
| `additional_context` 注入不可 | ファイル経路のみ（Hook 出力に依存しない） |
| Cloud Agent 非対応 | ドキュメントに記載；将来 Cloud 側 API 待ち |

---

## 12. 将来（v2 以降）

| 項目 | 説明 |
|------|------|
| LLM 分類 | prompt hook 内で小型モデル / prompt hook type |
| MCP サーバ単位露出 | 現 Gate は backend 内 tool 単位；複数 backend 時は template→backend マップ |
| `afterMCPExecution` 学習 | 推定 vs 実使用のフィードバックで重み更新 |
| Rules 連動 | `.cursor/rules` の MCP 指示を attachments 同等に |

---

## 13. 関連コード

| 既存 | 役割 |
|------|------|
| `packages/gate/internal/intent/infer.go` | merge 拡張点 |
| `packages/gate/internal/filter/classify.go` | `MatchIntent` |
| `scripts/lib/dashboard-project-recommend.mjs` | project signals |
| `catalog/marketplace/*.json` | tags 索引 |
| `scripts/cursor-registry-hook.mjs` | Hook パターン参考 |

---

## 14. 未決事項

1. **install 統合名:** `cursor:registry` 拡張 vs 新 `cursor:hooks`
2. **generation 不一致時:** 古い latest.json を無視する条件（conversation_id のみ vs generation_id 必須）
3. **複数 workspace_roots:** 全 root で project scan するか先頭のみか

---

## 付録 A — サンプル Hook 本体（骨子）

```javascript
#!/usr/bin/env node
import { inferPromptIntent, writePromptIntent } from "./lib/prompt-intent.mjs";

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.stdout.write(JSON.stringify({ continue: true }) + "\n");
    return;
  }
  const payload = JSON.parse(raw);
  if (payload.hook_event_name !== "beforeSubmitPrompt") {
    process.stdout.write(JSON.stringify({ continue: true }) + "\n");
    return;
  }
  const record = inferPromptIntent(payload);
  writePromptIntent(record);
  process.stdout.write(JSON.stringify({ continue: true }) + "\n");
}
```

## 付録 B — Gate 読取（骨子）

```go
func RecentPromptIntentKeywords(dir string, within time.Duration) string {
    path := filepath.Join(resolveDir(dir), "latest.json")
    // read, check ts, return keywords field
}
```
