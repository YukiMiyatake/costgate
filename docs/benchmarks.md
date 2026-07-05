# Benchmarks & verification data

フェーズごとの **トークン削減率** と **性能・検証** の記録。再現手順付き。

最終更新: **2026-07-05**  
計測環境: WSL2 / Node 22 / Go 1.25 / `@modelcontextprotocol/server-github`（GitHub MCP 26 tools）

---

## 計測方法

| 項目 | 内容 |
|------|------|
| トークン推定 | `ceil(bytes / 4)`（Probe / compare / compress-report 共通。tiktoken 置換は Later） |
| 対象 MCP | GitHub（`~/.costgate/backends.json`） |
| 除外 | Serena・会話・システムプロンプト・他 MCP |
| 定義レイヤ | `tools/list` の JSON スキーマ合計 |
| 結果レイヤ | `tools/call` 応答の JSON サイズ（text 中心） |

### 再現コマンド

```bash
npm run build:gate
npm run compare              # Phase 3–4: 定義レイヤ
npm run compress-report      # Phase 9: 定義 + 結果レイヤ
npm run session-report       # Phase 7: Probe ログ内訳
npm run test:gate:filter     # Phase 3, 8: スモーク
npm run test:gate:compress   # Phase 9: ユニット
```

---

## サマリー（GitHub MCP）

| Phase | 検証対象 | Before | After | 削減率 | 検証方法 |
|-------|----------|--------|-------|--------|----------|
| **1** Probe | ベースライン計測 | — | 26 tools / ~3,957 tok | — | Probe JSONL |
| **2** Gate 透明 | 透過プロキシ | 26 tools | 26 tools | 0% | `test:gate` |
| **3** Gate filter | ツール定義 | ~3,957 tok | ~883 tok | **77.7%** | `compare` |
| **4** compare | レポート CLI | 同上 | 同上 | 77.7% | `npm run compare` |
| **5** Cursor 切替 | 本番構成 | — | Gate ON | — | `cursor:production` |
| **6** cloud | ログ集約 | — | Reporter/API | — | costgate-cloud |
| **7** session-report | 固定/変動内訳 | 固定 ~100%* | 定義削減シナリオ | ~15% @20k turn* | Probe ログ |
| **8** dynamic intent | Tier B 露出 | 8 tools | ~14 tools† | 可変 | `test:gate:filter` |
| **9** compress | ツール結果 | ~19,161 tok‡ | ~3,492 tok‡ | **81.8%**‡ | `compress-report` |
| **3+9 合算** | 定義+大きい1 call | ~23,118 tok | ~4,375 tok | **81.1%** | `compress-report` |

\* tool_call ログが少ないセッションでは fixed share ≈ 100%。20k tokens/turn 想定の全体削減 ~15% は roadmap シナリオ。  
† `COSTGATE_INTENT="pull request"` 時。トークン数はツール数増加に比例（Tier B 追加）。  
‡ `get_file_contents` で `YukiMiyatake/costgate` の `package-lock.json`（~66k text chars）。

---

## フェーズ別詳細

### Phase 1 — Probe MVP（ベースライン）

| 指標 | 値 |
|------|-----|
| Backend tools | 26 |
| schema bytes | 15,827 |
| est. tokens / `tools/list` | **~3,957** |
| ログ | `~/.costgate/logs/probe-YYYY-MM-DD.jsonl` |

**検証:** `node test/probe-measurement.mjs` — Probe 経由で 26 tools を確認。

---

### Phase 2 — Gate MVP（透明モード）

| 指標 | 値 |
|------|-----|
| `COSTGATE_GATE_MODE=transparent` | 26 tools（Pass-through） |
| 削減 | なし（比較用ベースライン） |

**検証:** `npm run test:gate`

**性能:** Gate バイナリ起動 + GitHub MCP spawn が支配的。スクリプトは backend 接続待ち **5s**（`startupMs`）。

---

### Phase 3 — Gate filter v1

| 指標 | Before（透明） | After（filter） | 削減 |
|------|----------------|-----------------|------|
| tools（list 上） | 26 | 8 | 69.2% |
| schema bytes | 15,827 | 3,529 | 77.7% |
| est. tokens | **3,957** | **883** | **77.7%** |
| 削減量 / turn | — | — | **~3,074 tok** |

**After の 8 tools:** `discover_tools`, `invoke_tool` + Tier A 6 件（`get_file_contents`, `get_issue`, `search_*` 等）。

**検証:** `npm run test:gate:filter`, `npm run compare`

---

### Phase 4 — Before/After compare

`npm run compare` の実測（2026-07-05）:

```json
{
  "before": { "tool_count": 26, "estimated_tokens": 3957 },
  "after":  { "tool_count": 8,  "estimated_tokens": 883 },
  "reduction": { "tools_pct": 69.2, "tokens_pct": 77.7 }
}
```

---

### Phase 5 — Cursor production switch

| 項目 | 内容 |
|------|------|
| 検証内容 | `~/.cursor/mcp.json` で Gate ON / Probe OFF |
| 削減 | 間接（本番で Phase 3+9 が有効になる） |
| 性能 | MCP 切替後 Cursor 再起動が必要 |

**検証:** `npm run test:cursor-gate`, `npm run cursor:production`

---

### Phase 6 — costgate-cloud MVP

| 項目 | 内容 |
|------|------|
| 検証内容 | Probe JSONL → Reporter / `POST /v1/metrics` |
| 削減 | なし（可視化・集約） |
| 追加フィールド | `mcp_measurable_total_tokens`, `fixed_share_pct`（Phase 7 連携） |

**検証:** costgate-cloud 側 `npm run report`

---

### Phase 7 — Session token breakdown

Probe ログ（2026-07-04）サンプル:

| 指標 | 値 |
|------|-----|
| `tools/list` events | 複数セッションで ~3,957 tok/event |
| tool_call ログ | 当該期間はほぼなし → fixed share ≈ 100% |

**Gate 定義削減の全体影響（シナリオ）:**

| 1 turn 合計 tokens | 推定全体削減 |
|---------------------|--------------|
| 5,000 | ~61% |
| 10,000 | ~31% |
| **20,000** | **~15%** |
| 50,000 | ~6% |
| 100,000 | ~3% |

（定義 ~3,074 tok/turn 節約を前提。`npm run session-report`）

---

### Phase 8 — Dynamic intent

| 条件 | tools/list | 備考 |
|------|------------|------|
| filter, intent なし | 8 | Tier A + meta |
| filter, `COSTGATE_INTENT="pull request"` | **14** | Tier B 追加露出 |
| `COSTGATE_INTENT_DYNAMIC=0` | 静的のみ | compare / compress-report デフォルト |

**検証:** `npm run test:gate:filter`（intent 付きスモーク）

**性能:** ツール呼び出し後 `AddTool` / `RemoveTools` — 通常 call あたり数 ms（Go 内処理）。クライアントは `tools/list changed` 通知を受信。

---

### Phase 9 — Response compression

**条件:** `COSTGATE_COMPRESS=1`, `COSTGATE_COMPRESS_MAX_CHARS=12000`  
**テスト call:** `invoke_tool` → `get_file_contents(owner=YukiMiyatake, repo=costgate, path=package-lock.json)`

| 指標 | 圧縮 OFF | 圧縮 ON | 削減 |
|------|----------|---------|------|
| text chars | 65,808 | 11,998 | 81.8% |
| est. tokens（応答 JSON） | **19,161** | **3,492** | **81.8%** |
| 削減量 / call | — | — | **~15,669 tok** |

**定義 + 上記 1 call の合算（compress-report 2026-07-05）:**

| | tokens |
|---|--------|
| Before（透明 + 未圧縮結果） | ~23,118 |
| After（filter + compress） | ~4,375 |
| **Overall** | **81.1%** |

**検証:** `npm run test:gate:compress`（Go ユニット）, `npm run compress-report`

**本番:** `npm run cursor:production` で `COSTGATE_COMPRESS=1` を設定。

---

## 性能メモ

| 処理 | 目安 | 備考 |
|------|------|------|
| GitHub MCP 初回 spawn | 10–30s | `npx @modelcontextprotocol/server-github` |
| Gate 接続待ち（脚本） | 5s | `startupMs` 固定 |
| `npm run compare` | ~2 min | Gate ×2 起動 |
| `npm run compress-report` | ~3 min | Gate ×4 + 2× tool call |
| Probe `tools/list` 初回 | ~2–3s | JSONL タイムスタンプ差分 |
| 圧縮処理（Gate 内） | <1ms | 文字列 truncate のみ |

Gate 自体の CPU/メモリオーバーヘッドは MCP セッション全体に対し **誤差程度**。ボトルネックは backend MCP と LLM コンテキスト。

---

## 限界・注意

1. **推定精度:** `bytes/4` は近似。実請求はモデル tiktoken に依存（Later: tiktoken 導入）。
2. **Backend 依存:** 上記数値は GitHub MCP 26 tools 構成時点のもの。MCP バージョンで変動。
3. **圧縮 trade-off:** 12k chars 超の file 内容は末尾が切れる。全文必要な操作では `COSTGATE_COMPRESS=0`。
4. **全体請求:** Serena・会話トークンは対象外。GitHub 分のみ削減。

---

## 関連ドキュメント

- [roadmap.md](./roadmap.md) — フェーズ一覧
- [log-schema.md](./log-schema.md) — Probe JSONL スキーマ
- [architecture.md](./architecture.md) — Probe / Gate / Serena 役割
