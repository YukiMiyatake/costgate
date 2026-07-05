# Benchmarks & verification data

フェーズごとの **トークン削減率** と **性能・検証** の記録。再現手順付き。

最終更新: **2026-07-05**（Phase 10–22 追計測）  
計測環境: Docker toolchain / Node 22 / Go 1.25 / WSL2  
Backend: GitHub MCP 26 tools（`~/.costgate/backends.json`）+ mock MCP 16 tools（`compare --mock` / `eval`）

---

## 計測方法

| 項目 | 内容 |
|------|------|
| トークン推定 | **tiktoken `cl100k_base`**（Probe / compare / compress-report）。旧ログは `ceil(bytes/4)` フォールバック |
| 対象 MCP | GitHub（`~/.costgate/backends.json`） |
| 除外 | Serena・会話・システムプロンプト・他 MCP |
| 定義レイヤ | `tools/list` の JSON スキーマ合計 |
| 結果レイヤ | `tools/call` 応答の JSON サイズ（text 中心） |

### 再現コマンド

```bash
npm run build:gate
npm run compare              # Phase 3–4: 定義レイヤ（GitHub）
npm run compare -- --mock    # Phase 14: 定義レイヤ（mock、トークン不要）
npm run compress-report      # Phase 9: 定義 + 結果レイヤ
npm run compress-report -- --code-mode   # Phase 12: code-mode 比較
npm run eval                 # Phase 13+: タスク成功率（mock）
npm run eval:live            # Phase 17: GitHub live（token 要）
npm run benchmark:ci         # Phase 18: mock compare 回帰アサート
npm run test:filesystem      # Phase 19: filesystem catalog smoke
npm run session-report       # Phase 7: Probe ログ内訳
npm run test:gate:filter     # Phase 3, 8: スモーク
npm run test:gate:compress   # Phase 9: ユニット
npm run test:gate:codemode   # Phase 12: ユニット
```

Docker: `./docker.sh npm run compare` 等（[docker.md](./docker.md)）

---

## サマリー（GitHub MCP）

| Phase | 検証対象 | Before | After | 削減率 | 検証方法 |
|-------|----------|--------|-------|--------|----------|
| **1** Probe | ベースライン計測 | — | 26 tools / ~3,357 tok‡ | — | Probe JSONL |
| **2** Gate 透明 | 透過プロキシ | 26 tools | 26 tools | 0% | `test:gate` |
| **3** Gate filter | ツール定義 | ~3,357 tok | ~1,032 tok | **69.3%**‡ | `compare` |
| **4** compare | レポート CLI | 同上 | 同上 | 69.3% | `npm run compare` |
| **5** Cursor 切替 | 本番構成 | — | Gate ON | — | `cursor:production` |
| **6** cloud | ログ集約 | — | Reporter/API | — | costgate-cloud |
| **7** session-report | 固定/変動内訳 | 固定 ~100%* | 定義削減シナリオ | ~15% @20k turn* | Probe ログ |
| **8** dynamic intent | Tier B 露出 | 10 tools | ~14 tools† | 可変 | `test:gate:filter` |
| **9** compress | ツール結果 | ~32,718 tok‡ | ~5,699 tok‡ | **82.6%**‡ | `compress-report` |
| **3+9 合算** | 定義+大きい1 call | ~36,075 tok | ~6,731 tok | **81.3%**‡ | `compress-report` |
| **10** tiktoken | 推定精度 | bytes/4 | cl100k_base | — | `test:tokens` |
| **11** Gate release | 配布 | — | GitHub Releases | — | `install-gate.sh` |
| **12** Code Mode | ソース outline | 978 tok§ | 978 tok§ | 0%§ | `compress-report --code-mode` |
| **13** Accuracy eval | タスク成功率 | — | **13/13 pass** | 100% | `npm run eval` |
| **14** Multi-MCP mock | 定義（catalog） | 684 tok | 320 tok | **53.2%** | `compare --mock` |
| **15** Probe npm | 配布 | — | `npx @costgate/probe` | — | tag → npm CI |
| **16** Code Mode v2 | AST outline | regex | go/ast + scanner | 品質↑ | `test:gate:codemode` |
| **17** Eval v2 | タスク拡張 | 13 tasks | **21 tasks** | 100% | `eval --diff` |
| **18** benchmark CI | mock 回帰 | 734 tok | 370 tok | **49.6%** | `benchmark:ci` |
| **19** filesystem MCP | catalog smoke | 9 tools | 8 tools | tool↓ | `test:filesystem` |
| **20** JSON compress | 大 JSON | raw | summary | 大幅↓ | eval `compress_json_summary` |
| **20** dedupe | 再 read | full | cache hit | — | eval `dedupe_repeat_read` |
| **22** probe intent | Tier B 露出 | — | merge 検出 | — | eval `probe_intent` |

\* tool_call ログが少ないセッションでは fixed share ≈ 100%。20k tokens/turn 想定の全体削減 ~15% は roadmap シナリオ。  
† `COSTGATE_INTENT="pull request"` 時。トークン数はツール数増加に比例（Tier B 追加）。  
‡ **2026-07-05 再計測**（GitHub MCP 26 tools）。MCP バージョンで schema サイズは変動（旧: ~3,957→883 tok）。  
§ `main.go` は 2,503 chars < `MIN_CHARS=3000` のため outline 未適用。mock eval で大ファイル outline を検証。

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
| tools（list 上） | 26 | 10 | 61.5% |
| schema bytes | 15,827 | 4,622 | 70.8% |
| est. tokens | **3,357** | **1,032** | **69.3%** |
| 削減量 / turn | — | — | **~2,325 tok** |

**After の 10 tools:** `discover_tools`, `invoke_tool` + Tier A 8 件（`get_file_contents`, `get_issue`, `search_*`, `create_issue`, `list_issues` 等）。

**検証:** `npm run test:gate:filter`, `npm run compare`

> 旧計測（2026-07-05 午前）: 26→8 tools, 3,957→883 tok（77.7%）。GitHub MCP の schema 更新で数値は変動する。

---

### Phase 4 — Before/After compare

`npm run compare` の実測（2026-07-05 再計測）:

```json
{
  "before": { "tool_count": 26, "estimated_tokens": 3357 },
  "after":  { "tool_count": 10, "estimated_tokens": 1032 },
  "reduction": { "tools_pct": 61.5, "tokens_pct": 69.3 }
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
| filter, intent なし | 10 | Tier A + meta（2026-07-05 再計測） |
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
| text chars | 67,021 | 11,998 | 82.1% |
| est. tokens（応答 JSON） | **32,718** | **5,699** | **82.6%** |
| 削減量 / call | — | — | **~27,019 tok** |

**定義 + 上記 1 call の合算（compress-report 2026-07-05 再計測）:**

| | tokens |
|---|--------|
| Before（透明 + 未圧縮結果） | ~36,075 |
| After（filter + compress） | ~6,731 |
| **Overall** | **81.3%** |

**検証:** `npm run test:gate:compress`（Go ユニット）, `npm run compress-report`

**本番:** `npm run cursor:production` で `COSTGATE_COMPRESS=1` を設定。

---

### Phase 10 — tiktoken

| 項目 | 内容 |
|------|------|
| Encoding | `cl100k_base`（`js-tiktoken` / Probe + scripts 共通） |
| フォールバック | 旧 JSONL（`estimated_tokens` なし）は `ceil(bytes/4)` |
| 検証 | `npm run test:tokens` — PASS（2026-07-05） |

---

### Phase 11 — Gate releases

| 項目 | 内容 |
|------|------|
| 配布 | GitHub Releases（goreleaser）、`./scripts/install-gate.sh` |
| プラットフォーム | linux/darwin/windows × amd64/arm64 |
| トークン削減 | なし（配布インフラ） |

**検証:** `npm run release:check`, `costgate-gate --version`

---

### Phase 12 — Code Mode

**条件:** `COSTGATE_CODE_MODE=1`, `MIN_CHARS=3000`, `MAX_CHARS=6000`  
**テスト path:** `packages/gate/cmd/costgate-gate/main.go`（GitHub live call）

| 指標 | raw | code-mode only | code-mode + compress |
|------|-----|----------------|----------------------|
| text chars | 2,503 | 2,503 | 2,503 |
| est. tokens | 978 | 978 | 978 |
| 削減 | — | **0%**（閾値未満） | 0% |

`main.go` は `MIN_CHARS=3000` 未満のため outline 未適用。大ファイル（mock `get_file_contents` + 1,200 行 filler）では eval で outline 変換を確認。

**検証:** `npm run test:gate:codemode`, `npm run compress-report -- --code-mode`, `npm run eval`（`code_mode_outline` タスク）

---

### Phase 13 — Accuracy eval

**条件:** mock MCP、4 モード（transparent / filter / filter+compress / filter+full）

| 指標 | 値 |
|------|-----|
| タスク数 | 13 |
| Pass rate | **100%**（13/13） |
| 1 タスクあたり | ~4s（Gate 起動込み） |
| 全体 runtime | ~3 min（Docker） |

**モード別（filter_full の tools/list 推定）:** ~479 tokens（15 backend → 5 exposed + meta 2）

**検証:** `npm run eval`, `npm run eval -- --json`

---

### Phase 14 — Multi-MCP catalog

**条件:** `npm run compare -- --mock`（tier catalog `mock.json` 適用）

| 指標 | Before（透明） | After（filter + catalog） | 削減 |
|------|----------------|---------------------------|------|
| tools | 15 | 6 | 60% |
| est. tokens | **684** | **320** | **53.2%** |

**検証:** `npm run compare -- --mock`, `go test ./internal/catalog/...`

---

### Phase 15 — Probe npm publish

| 項目 | 内容 |
|------|------|
| 配布 | tag `v*` → `npm-publish.yml` → `@costgate/schema` + `@costgate/probe` |
| 導入 | `npx @costgate/probe` |
| トークン削減 | なし（配布） |

**前提:** GitHub repo secret `NPM_TOKEN`

---

### Phase 16 — Code Mode v2

**条件:** `COSTGATE_CODE_MODE=1`, `COSTGATE_CODE_MODE_ENGINE=auto`（既定）

| 項目 | Phase 12（regex） | Phase 16（go/ast + scanner） |
|------|-------------------|------------------------------|
| Go 抽出 | 行 regex | `go/parser` + doc comment |
| JS/TS | 行 regex | 複数行 signature scanner |
| Python | 行 regex | decorator + docstring scanner |
| outline ヘッダ | `signatures:` のみ | `engine: ast\|regex` 追加 |
| eval 品質 | contains/excludes | + `assert_symbols` |

**検証:** `npm run test:gate:codemode`（9 tests）, `npm run eval`（`code_mode_outline` に `hello`/`Config`/`engine: ast`）

---

### Phase 17 — Eval v2

| 指標 | 値 |
|------|-----|
| タスク数 | **21**（mock、5 モード） |
| Pass rate | **100%**（21/21） |
| baseline | `test/eval/baseline.json`（`eval --out` / `--diff`） |
| live | `npm run eval:live`（`GITHUB_TOKEN`、週次 CI optional） |

---

### Phase 18 — benchmark CI

| 指標 | Before | After | 削減 |
|------|--------|-------|------|
| mock tools | 16 | 7 | 56% |
| est. tokens | ~734 | ~370 | **49.6%** |

**検証:** `npm run benchmark:ci`（CI 組込み）、`compress-report --mock` / `session-report --mock`

---

### Phase 19 — Multi-MCP（filesystem）

| 指標 | transparent | filter |
|------|-------------|--------|
| tools | 9 | 8（+2 meta） |
| est. tokens | ~324 | ~361 |

filesystem は Tier A が多く token 増もあり得る。smoke は **tool 数削減 + catalog 適用** を検証。

**検証:** `npm run test:filesystem`, `compare --mock --backend filesystem`

---

### Phase 20 — Result intelligence

| 機能 | 検証 |
|------|------|
| JSON summary | eval `compress_json_summary` — `[costgate: json summary` |
| Session dedupe | eval `dedupe_repeat_read` — 2 回目 `[costgate: dedupe cache hit]` |

**検証:** `go test ./internal/compress/... ./internal/result/...`

---

### Phase 22 — Smart intent

Probe JSONL の直近 `tool_call` から intent キーワードを推論し Tier B を露出。

**検証:** eval `probe_intent_exposes_merge`（`seed_probe_log` + `discover_tools`）

---

## 性能メモ

| 処理 | 目安 | 備考 |
|------|------|------|
| GitHub MCP 初回 spawn | 10–30s | `npx @modelcontextprotocol/server-github` |
| Gate 接続待ち（脚本） | 5s | `startupMs` 固定 |
| `npm run compare` | ~2 min | Gate ×2 起動 |
| `npm run compare -- --mock` | ~2 min | mock MCP、GitHub 不要 |
| `npm run compress-report` | ~3 min | Gate ×4 + 2× tool call |
| `npm run compress-report -- --code-mode` | ~4 min | 上記 + code-mode 3 パターン |
| `npm run eval` | ~4 min | mock、21 タスク |
| `npm run benchmark:ci` | ~2.5 min | mock compare + アサート |
| Probe `tools/list` 初回 | ~2–3s | JSONL タイムスタンプ差分 |
| 圧縮処理（Gate 内） | <1ms | 文字列 truncate のみ |

Gate 自体の CPU/メモリオーバーヘッドは MCP セッション全体に対し **誤差程度**。ボトルネックは backend MCP と LLM コンテキスト。

---

## 限界・注意

1. **推定精度:** `cl100k_base`（Phase 10）。モデルによって実請求トークンは異なる場合あり。
2. **Backend 依存:** 上記数値は GitHub MCP 26 tools 構成時点のもの。MCP バージョンで変動。
3. **圧縮 trade-off:** 12k chars 超の file 内容は末尾が切れる。全文必要な操作では `COSTGATE_COMPRESS=0`。
4. **Code Mode 閾値:** `COSTGATE_CODE_MODE_MIN_CHARS=3000` 未満のファイルは outline しない。
5. **GitHub MCP  drift:** `tools/list` の token 数は MCP パッケージ版本で変動（上表は 2026-07-05 時点）。
6. **全体請求:** Serena・会話トークンは対象外。GitHub 分のみ削減。

---

## 関連ドキュメント

- [roadmap.md](./roadmap.md) — フェーズ一覧
- [log-schema.md](./log-schema.md) — Probe JSONL スキーマ
- [architecture.md](./architecture.md) — Probe / Gate / Serena 役割
