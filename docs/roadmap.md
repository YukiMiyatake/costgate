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
| **15. Probe npm publish** | 📋 Planned | `npx @costgate/probe` public distribution |

**costgate-cloud（別 repo）:** Phase 16+ — dashboard, auto-upload, Stripe / Team policies

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

## Upcoming phases (12+)

Phase 1–11 で **計測 → 削減 → 配布** の OSS コアは完成。  
Phase 12 以降は **削減の質・信頼性・適用範囲・配布** を広げ、costgate-cloud で **可視化・課金** を進める。

### 優先順（推奨）

```
Phase 12 Code Mode      … 削減の質（truncate の先）
Phase 13 Accuracy eval  … 削減の副作用を定量
Phase 14 Multi-MCP      … GitHub 以外への拡張
Phase 15 Probe npm      … 計測の一般配布（小さく並行可）
Phase 16+ cloud         … Pro/Team 本番化（別 repo）
```

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

### Phase 15 — Probe npm publish 📋

**目的:** Gate と同様、Probe も **`npx @costgate/probe`** で導入可能に。

- **CI:** npm publish workflow（tag または manual）
- **ドキュメント:** README Quick start を publish 版に更新
- **工数:** 小 — Phase 12 と並行可能

### Phase 16+ — costgate-cloud（別 repo）📋

**目的:** Pro / Team プランの本番化。OSS 本体とは独立して進める。

| 項目 | 内容 |
|------|------|
| **16 Dashboard** | session-report の Web UI、履歴グラフ |
| **17 Auto-upload** | セッション終了後の metrics 自動送信 |
| **18 Billing** | Stripe、Pro/Team プラン |
| **19 Team policies** | 許可 MCP / ツール制限、組織ダッシュボード |

Repo: [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud) — Phase 6 MVP（Reporter + API + `cloud:upload`）済み。

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

| 対象 | OSS 現状 | 今後 |
|------|----------|------|
| MCP ツール定義（Gate 対象 MCP） | ✅ Gate filter + dynamic intent | Phase 14 multi-MCP |
| MCP ツール実行結果（truncate） | ✅ compress（Phase 9） | Phase 12 Code Mode で置き換え |
| ファイル読取の出力量 | ✅ code-mode + compress | Phase 13 eval で品質検証 |
| 削減の品質保証 | ❌ | **Phase 13 accuracy eval** |
| 会話・ユーザープロンプト・rules | ❌ | **未計画** |
| Serena / 直結 MCP の定義 | ❌（意図的に対象外） | — |

### Pro / Team プランとの関係

| Plan | 現状（Phase 1–11） | Phase 12+ で追加 |
|------|-------------------|------------------|
| **Free (OSS)** | Gate 削減 + Probe 計測 + CLI レポート | Code Mode、eval、multi-MCP |
| **Pro** | cloud MVP（手動 upload + markdown） | Phase 16–17 ダッシュボード・自動レポート |
| **Team** | — | Phase 18–19 課金・ポリシー・組織管理 |

Pro/Team は **可視化・レポート・チーム管理** が中心。会話トークンそのものを削る機能はロードマップに含めていない。

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
npm run session-report
```
