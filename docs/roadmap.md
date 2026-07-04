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

---

## Implementation phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **1. Probe MVP** | ✅ Done | Transparent stdio proxy, GitHub backend, JSONL logs |
| **2. Gate MVP** | ✅ Done | Go proxy, `tools/list` + `tools/call` pass-through |
| **3. Gate filter v1** | ✅ Done | Tier A/B/C, `discover_tools`, `invoke_tool`, usage store |
| **4. Before/After compare** | ✅ Done | `npm run compare` — schema token estimate report |
| **5. Cursor production switch** | ✅ Done | `npm run cursor:production`, measurement rollback |
| **6. costgate-cloud** | ⬜ Next | Pro reports, API, billing ([costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud)) |

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

### Phase 6 — costgate-cloud ⬜

- Automated Before/After reports (Pro)
- Team usage dashboard, policies (Team / Enterprise)
- Opt-in metrics upload from Probe/Gate
- Scaffold: [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud)

---

## Later (not scheduled)

| Item | Notes |
|------|-------|
| Dynamic intent per turn | Keyword/env today; needs client message hook or heuristics |
| Response compression | Inside Gate, after filter is stable |
| Code Mode MCP | Token-optimized file/symbol output |
| tiktoken | Replace ≈4 bytes/token estimate in Probe/compare |
| GitHub Releases + goreleaser | Gate binary distribution |

---

## Quick commands

```bash
npm run build:probe && npm run build:gate
npm run test:gate
npm run test:gate:filter
npm run compare
```
