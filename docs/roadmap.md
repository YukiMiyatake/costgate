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

`npm run compare` は **定義レイヤのみ**。変動コスト込みは **Phase 7**。

### 削減対象の整理

| 対象 | OSS 現状 | 今後 |
|------|----------|------|
| MCP ツール定義（Gate 対象 MCP） | ✅ Gate filter | ✅ 動的 intent（Phase 8） |
| MCP ツール実行結果 | ❌ | Response compression（Later） |
| ファイル読取の出力量 | ❌ | Code Mode MCP（Later） |
| 会話・ユーザープロンプト・rules | ❌ | **未計画** |
| Serena / 直結 MCP の定義 | ❌（意図的に対象外） | — |

### Pro / Team プランとの関係

| Plan | 主な価値 |
|------|----------|
| **Free (OSS)** | 定義削減（Gate）+ 計測（Probe） |
| **Pro** | レポート・クラウド履歴・**Phase 7 的な全体 % 表示** |
| **Team** | ダッシュボード・ポリシー |

Pro/Team は **可視化・レポート** が中心。会話トークンそのものを削る機能はロードマップに含めていない。

---

## Later (not scheduled)

| Item | Notes |
|------|-------|
| Dynamic intent per turn | ✅ Phase 8 — usage heuristics + live tools/list refresh |
| Response compression | Tool **results** (not definitions); inside Gate |
| Code Mode MCP | Token-optimized file/symbol **output** |
| Prompt / rules optimization | **Not scheduled** — conversation token reduction |
| tiktoken | Replace ≈4 bytes/token estimate in Probe/compare |
| GitHub Releases + goreleaser | Gate binary distribution |

---

## Quick commands

```bash
npm run build:probe && npm run build:gate
npm run test:gate
npm run test:gate:filter
npm run compare
npm run session-report
```
