# Development roadmap

Implementation phases for CostGate OSS. Business plans (Free / Pro / Team) are in [README](../README.md#plans-roadmap).

## Architecture roles

| Component | Purpose | When to use |
|-----------|---------|-------------|
| **Probe** (`@costgate/probe`) | Measure token usage, JSONL logs | Development / baseline only |
| **Gate** (`costgate-gate`) | Filter `tools/list`, delegate calls | Production (daily Cursor) |
| **Serena** | Code intelligence | Direct in Cursor — never via Probe/Gate |
| **costgate-cloud** | Reports, billing, team features | Private repo (future) |

See [architecture.md](./architecture.md) for Cursor `mcp.json` layout.

## Git workflow

Daily work: **feature branch → PR → `main`** via `npm run feat:ship`.  
`develop` is not used.  
Details: [CONTRIBUTING.md](../CONTRIBUTING.md#branch-policy).

---

## Implementation phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **1. Probe MVP** | ✅ Done | Transparent stdio proxy, GitHub backend, JSONL logs |
| **2. Gate MVP** | ✅ Done | Go proxy, `tools/list` + `tools/call` pass-through |
| **3. Gate filter v1** | ✅ Done | Tier A/B/C, `discover_tools`, `invoke_tool`, usage store |
| **4. Before/After compare** | ✅ Done | `npm run compare` — schema token estimate report |
| **5. Cursor production switch** | ✅ Done | `npm run cursor:production`, measurement rollback |
| **6. costgate-cloud** | ✅ MVP | Reporter, API, OSS `cloud:upload` |
| **7. Session token breakdown** | ✅ Done | `npm run session-report` |
| **8. Dynamic intent** | ✅ Done | Usage-based Tier B exposure + live tools/list refresh |
| **9. Response compression** | ✅ Done | Gate truncates oversized tool result text |
| **10. tiktoken** | ✅ Done | `cl100k_base` token counts in Probe + reports |
| **11. Gate releases** | ✅ Done | goreleaser + GitHub Releases + `install-gate.sh` |
| **12. Code Mode** | ✅ Done | Source outline transform for file read tools |
| **13. Accuracy eval** | ✅ Done | Task harness — filter/compress/code-mode regression |
| **14. Multi-MCP catalog** | ✅ Done | Backend tier rules (github/mock) + compare --mock |
| **15. Probe npm publish** | ✅ Done | tag `v*` → npm publish workflow |
| **16. Code Mode v2** | ✅ Done | go/ast + JS/Py scanners, eval symbol assertions |

**costgate-cloud（別 repo）:** 後回し — [Deferred](#deferred-costgate-cloud) 参照

---

## Development priority（2026-07）

**方針: OSS 本体（削減の質・範囲・信頼性）を優先。costgate-cloud（Dashboard / Billing / Team）は Phase 1–15 完了後も当面後回し。**

| 優先 | 領域 | 理由 |
|------|------|------|
| **1** | Gate / Probe / eval / catalog（本 repo） | 全ユーザーが直接得るトークン削減 |
| **2** | 配布・DX（npm publish、WSL、benchmark CI） | 導入摩擦と回帰防止 |
| **3** | costgate-cloud（別 repo） | OSS が安定してから Pro/Team 化 |

```
Phase 16–22  OSS 強化（本 repo）     ← 現在の主戦場
Phase 30+    costgate-cloud         ← 後回し（MVP は Phase 6 済み）
```

---

### Phase 1 — Probe MVP ✅

- stdio MCP proxy to GitHub (and other heavy MCPs)
- Serena excluded from Probe/Gate backends
- Logs: `~/.costgate/logs/probe-YYYY-MM-DD.jsonl`
- Test: `node test/probe-measurement.mjs`

**Baseline (GitHub MCP, 26 tools):** ~3,957 estimated tokens/turn for `tools/list` fixed cost.

### Phase 2 — Gate MVP ✅

- Go binary + `go-sdk/mcp`
- Same `~/.costgate/backends.json` as Probe
- `COSTGATE_GATE_MODE=transparent` for full pass-through
- Test: `npm run test:gate`

### Phase 3 — Gate filter v1 ✅

- **Tier A** (~20%): always in `tools/list`
- **Tier B** (~30%): exposed when `COSTGATE_INTENT` keywords match
- **Tier C**: hidden — `discover_tools` + `invoke_tool`
- Usage: `~/.costgate/usage.json` (imports Probe JSONL when present)
- Test: `npm run test:gate:filter`

**Typical reduction (no intent):** ~78% fewer estimated `tools/list` tokens (26 → 8 tools).

### Phase 4 — Before/After compare ✅

- CLI: `npm run compare`
- Compares gate transparent (or `--via-probe`) vs gate filter
- Options: `--intent`, `--json`

### Phase 5 — Cursor production switch ✅

- `npm run cursor:production` — Gate ON, Probe OFF（`~/.cursor/mcp.json`）
- `npm run cursor:measurement` — 計測時のみ Probe に戻す
- Example: [examples/cursor/mcp-production.json](../examples/cursor/mcp-production.json)
- Test: `npm run test:cursor-gate`
- **Restart Cursor** after switching MCP config

### Phase 6 — costgate-cloud ✅ (MVP)

- **Reporter**: `npm run report` in costgate-cloud — local markdown from Probe JSONL
- **API**: `npm run api:dev` — `POST /v1/metrics` (file-backed)
- **OSS upload**: `npm run cloud:upload` — opt-in (`COSTGATE_CLOUD_URL`, `COSTGATE_CLOUD_API_KEY`)
- Repo: [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud)

**Planned:** web dashboard, Stripe billing, scheduled PDF

### Phase 7 — Session token breakdown ✅

- CLI: `npm run session-report` — Probe JSONL 内訳 + Gate  live compare + 全体削減シナリオ
- Options: `--json`, `--skip-compare`, `--intent`
- costgate-cloud Reporter: `mcp_measurable_total_tokens`, `fixed_share_pct` をレポートに追加

**Example output:** fixed ~100% when no tool_call logs; Gate saves ~3,074 tokens/turn → ~15% at 20k turn.

### Phase 8 — Dynamic intent ✅

- **Usage inference**: recent tool calls (30 min window) → intent keywords for Tier B
- **`COSTGATE_INTENT`**: static keywords still apply; merged with dynamic
- **Live refresh**: Tier B tools added/removed via `AddTool` / `RemoveTools` after each call
- **`COSTGATE_INTENT_DYNAMIC`**: default `1`; set `0` to disable (compare uses static only)
- Test: `npm run test:gate:filter`

### Phase 9 — Response compression ✅

- **`COSTGATE_COMPRESS=1`**: truncate oversized text in `tools/call` results
- **`cursor:production`**: 本番 MCP で compress デフォルト ON
- **`COSTGATE_COMPRESS_MAX_CHARS`**: total text budget (default 12,000)
- Applies to exposed tools and `invoke_tool` backend calls
- Head/tail preserve + `[costgate: truncated …]` marker
- Test: `npm run test:gate:compress`, `npm run compress-report`

**Measured (package-lock.json via get_file_contents):** ~19,161 → ~3,492 tokens (**81.8%**). See [benchmarks.md](./benchmarks.md).

### Phase 10 — tiktoken ✅

- **Encoding:** `cl100k_base`（Claude / GPT-4 系の近似）
- **Probe:** `tools/list` / `tool_call` ログの `estimated_tokens`
- **Scripts:** `compare`, `session-report`, `compress-report` が同一ロジック
- **Fallback:** バイトのみの旧ログは `ceil(bytes/4)` のまま
- Test: `npm run test:tokens`

### Phase 11 — Gate releases ✅

- **goreleaser**: `.goreleaser.yaml` — linux/darwin/windows × amd64/arm64
- **CI**: tag `v*` push → `.github/workflows/release.yml`
- **Install**: `./scripts/install-gate.sh`（Go 不要）
- **Version**: `costgate-gate --version`（ldflags 注入）
- Verify: `goreleaser check`（CI）、`npm run release:check`

---

## Upcoming phases (16+)

Phase 1–15 で **計測 → 削減 → 配布 → 検証** の OSS コアは完成。  
Phase 16 以降は **OSS 機能の深化** を優先し、cloud は [Deferred](#deferred-costgate-cloud) へ。

### 優先順（OSS ファースト）

```
Phase 16  Code Mode v2           … outline 精度（tree-sitter）
Phase 17  Eval v2                … GitHub live + 回帰履歴
Phase 18  DX & benchmark CI      … --mock レポート、drift 検知
Phase 19  Multi-MCP 実測          … filesystem / browser catalog
Phase 20  Result intelligence    … JSON-aware compress、dedupe
Phase 21  Release & 配布         … npm v0.5.0、Gate installer 改善
Phase 22  Smart intent（検討）   … keyword 超えの Tier B 露出
        ↘ Phase 30+ cloud       … 後回し
```

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **16. Code Mode v2** | ✅ Done | go/ast + JS/Py scanners, eval symbol assertions |
| **17. Eval v2** | ✅ Done | chain tasks, --out/--diff, optional live CI |
| **18. DX & benchmark CI** | ✅ Done | `--mock` reports, benchmark:ci, examples 整備 |
| **19. Multi-MCP 実測** | ✅ Done | filesystem/browser catalog + smoke test |
| **20. Result intelligence** | ✅ Done | JSON-aware compress、セッション dedupe |
| **21. Release & 配布** | ✅ Done | RELEASE.md、publish:check、install 改善 |
| **22. Smart intent** | 🔍 Consider | Probe ログベース intent（要スパイク） |

### Phase 16 — Code Mode v2 ✅

**目的:** regex outline → AST / scanner ベースで **削減率を維持しつつ情報損失を減らす**。

- **Go:** `go/parser` + `go/ast`（signature + doc comment）
- **JS/TS:** 複数行 signature scanner（`export async function` 等）
- **Python:** decorator + docstring + `async def` scanner
- **`COSTGATE_CODE_MODE_ENGINE`:** `auto`（既定）| `ast` | `regex`
- outline ヘッダに `engine: ast|regex` を出力
- eval: `assert_symbols` で outline 品質を検証
- Test: `npm run test:gate:codemode`, `npm run eval`

> CGO なし静的ビルド（WSL）のため tree-sitter ではなく stdlib / pure-Go scanner を採用。

### Phase 17 — Eval v2 ✅

**目的:** mock 100% pass を **本番に近い条件** で補強。

- 固定タスク: `search_issues`、`discover_tools` → `invoke_tool` チェーン、path 特定
- `npm run eval -- --out` 履歴 JSON（`version: 2`）
- `npm run eval -- --diff test/eval/baseline.json` フェーズ間 diff
- `npm run eval:live` + `.github/workflows/eval-live.yml`（`GITHUB_TOKEN` あり時のみ）
- Test: `npm run eval`, optional `npm run eval:live`

### Phase 18 — DX & benchmark CI ✅

**目的:** 開発体験と **計測値ドリフト** の早期検知。

- `compress-report` / `session-report` に `--mock`（compare 同様）
- `npm run benchmark:ci` — mock compare + token 上限アサート（CI 組込み）
- `classify.go` スコア式を定数化
- examples: 絶対パス除去（`costgate-gate` / `npx @costgate/probe` / `~/.costgate/...`）

### Phase 19 — Multi-MCP 実測 ✅

**目的:** GitHub 以外の backend で **tier catalog + 実測**。

- `catalog/tiers/filesystem.json` — read/list/search Tier A、write Tier B
- `catalog/tiers/browser.json` — navigate/snapshot Tier A テンプレ
- `test/fixtures/mock-filesystem-mcp` — 9 tools smoke fixture
- `npm run compare -- --mock --backend filesystem`
- `npm run test:filesystem` — CI smoke
- Test: `go test ./internal/catalog/...`, `npm run test:filesystem`

### Phase 20 — Result intelligence ✅

**目的:** compress の **切り方** を賢くする（情報損失 vs トークン）。

- JSON: top-level keys + 先頭 N entries 要約（`COSTGATE_COMPRESS_JSON=1` 既定 ON）
- 同一 tool+args の再 read → セッション内 dedupe cache（`COSTGATE_DEDUPE=1` 既定 ON）
- eval: `compress_json_summary`, `dedupe_repeat_read`
- Test: `go test ./internal/compress/... ./internal/result/...`, `npm run eval`

### Phase 21 — Release & 配布 ✅

**目的:** Probe / Gate の **導入摩擦ゼロ**。

- [docs/RELEASE.md](./RELEASE.md) — npm tag / Gate release / Cursor 手順
- `npm run publish:check` — schema/probe バージョン整合
- `install-gate.sh` — PATH 案内
- 初回 npm publish: tag `v0.5.0` + `NPM_TOKEN`（手動）

### Phase 22 — Smart intent ✅

**目的:** 静的 `COSTGATE_INTENT` の限界を超える Tier B 露出。

- Probe JSONL から直近 `tool_call` → intent（`COSTGATE_INTENT_PROBE=1` 既定 ON）
- `intent.Resolve` — static + probe log + usage store
- eval: `seed_probe_log` で merge Tier B 露出を検証
- embedding 類似度は未実装（将来スパイク）

---

## Deferred — costgate-cloud

**ステータス: 後回し。** OSS Phase 16–22 が一段落してから [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud) で再開。

| Phase | 内容 | 前提 |
|-------|------|------|
| **30 Dashboard** | session / eval / benchmark の Web UI | OSS eval JSON 形式安定 |
| **31 Auto-upload** | セッション終了後 metrics 自動送信 | Probe `session_end` フック |
| **32 Billing** | Stripe Pro/Team | Dashboard MVP |
| **33 Team policies** | 許可 MCP / ツール制限 | Billing + Gate env テンプレ |

**既存（維持）:** Phase 6 MVP — Reporter、API、`npm run cloud:upload`（opt-in）。新規開発は OSS 優先の間は **bugfix のみ**。

---

## Completed phases (12–15)

### Phase 12 — Code Mode ✅

- **`COSTGATE_CODE_MODE=1`**: large source files → signature outline (Go/JS/Python)
- **Pipeline:** code-mode first, then compress (fallback for JSON / non-code)
- **Env:** `COSTGATE_CODE_MODE_MIN_CHARS` (3000), `COSTGATE_CODE_MODE_MAX_CHARS` (6000)
- **`cursor:production`**: code-mode ON by default (with compress)
- Test: `npm run test:gate:codemode`, `npm run compress-report -- --code-mode`

### Phase 13 — Accuracy eval ✅

**目的:** filter / compress / Code Mode が **タスク成功率** に与える影響を定量。

- **固定タスクセット:** mock MCP 上で discover / invoke / outline / compress
- **比較:** transparent vs filter vs compress vs Code Mode
- **成果物:** `npm run eval` + JSON/markdown レポート
- **CI:** integration 後に eval 実行（mock、トークン不要）

### Phase 14 — Multi-MCP catalog ✅

**目的:** GitHub 以外の backend 向け Tier 分類と CI 安全な compare。

- **catalog:** `internal/catalog/tiers/{github,mock}.json` — Tier A/B/C overrides
- **Gate:** usage classify の後に catalog rules を overlay
- **compare:** `npm run compare -- --mock` — mock MCP で before/after（トークン不要）
- **拡張:** 新 backend は `tiers/<name>.json` を追加

### Phase 15 — Probe npm publish ✅

**目的:** Gate と同様、Probe も **`npx @costgate/probe`** で導入可能に。

- **CI:** `.github/workflows/npm-publish.yml` — tag `v*` で `@costgate/schema` → `@costgate/probe` を publish
- **Secrets:** repo に `NPM_TOKEN`（npm automation token）を設定
- **Quick start:** README の `npx @costgate/probe` 例
- **残:** 初回 tag publish（→ Phase 21）

---

## Token impact (measured & estimated)

CostGate が **直接削減できるのは MCP ツール定義（`tools/list`）** が中心。請求全体への効果はセッション構成に依存する。

### ツール定義のみ（GitHub MCP・実測）

| 状態 | tools | est. tokens (`tools/list`) |
|------|-------|----------------------------|
| 透明（全件） | 26 | ~3,957 |
| Gate filter | 8 | ~883 |
| **定義のみの削減** | | **~78%** |

### 請求トークン全体への目安（GitHub MCP を Gate した場合）

1 ターンの合計 ≈ システム/会話 + **ツール定義（固定）** + **ツール結果（変動）** + 他 MCP（Serena 等）。

| 使い方 | Gate による全体削減の目安 |
|--------|---------------------------|
| 短い会話・定義が効きやすい | **15〜30%** |
| 通常のコーディング | **5〜15%** |
| 長い会話 + 大きな tool 結果 | **3〜8%** |
| Serena 定義が支配的 | **1〜5%**（GitHub 分のみ削減） |

例: 1 ターン 20,000 tokens のうち GitHub 定義 ~4,000 → Gate で ~3,000 削減 → **全体 ~15%**。

`npm run compare` は **定義レイヤのみ**。変動コスト込みは **Phase 7** / **Phase 9**（`compress-report`）。

**フェーズ別の実測値・性能:** [benchmarks.md](./benchmarks.md)

### 削減対象の整理

| 対象 | OSS 現状 | 今後（OSS 優先） |
|------|----------|------------------|
| MCP ツール定義（Gate 対象 MCP） | ✅ filter + catalog + dynamic intent | Phase 19 multi-MCP 実測 |
| MCP ツール実行結果 | ✅ compress + code-mode | Phase 20 JSON-aware compress |
| ファイル読取の出力量 | ✅ code-mode（go/ast + scanner） | Phase 17 eval v2 |
| 削減の品質保証 | ✅ eval（mock） | Phase 17 eval v2（GitHub optional） |
| 計測ドリフト・回帰 | 手動 benchmarks | Phase 18 benchmark CI |
| 会話・rules | ❌ 未計画 | Out of scope |
| Serena / 直結 MCP | ❌ 意図的対象外 | — |
| 可視化・課金（cloud） | MVP のみ | **Phase 30+ 後回し** |

### Pro / Team プランとの関係

| Plan | 現状 | 次の一手（優先順） |
|------|------|-------------------|
| **Free (OSS)** | Gate 削減 + Probe + CLI + eval | **Phase 16–21**（本 repo） |
| **Pro** | cloud MVP（手動 upload） | Phase 30+ Dashboard（後回し） |
| **Team** | — | Phase 32–33（後回し） |

Pro/Team の新機能開発は **OSS Phase 22 まで凍結**。既存 `cloud:upload` / Reporter はメンテのみ。

---

## Out of scope

| Item | Notes |
|------|-------|
| Prompt / rules optimization | **Not scheduled** — conversation token reduction |
| Serena / 直結 MCP の Gate 化 | 意図的に対象外 — コード操作は Serena 直結 |

---

## Completed (formerly Later)

| Item | Phase |
|------|-------|
| Dynamic intent per turn | ✅ 8 |
| Response compression | ✅ 9 |
| tiktoken | ✅ 10 |
| GitHub Releases + goreleaser | ✅ 11 |

---

## Quick commands

```bash
npm run build:probe && npm run build:gate
npm run test:gate
npm run test:gate:filter
npm run test:tokens
npm run compare
npm run compress-report
npm run eval
npm run test:integration
```
