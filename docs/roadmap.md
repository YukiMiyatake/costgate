# Development roadmap

Implementation phases for CostGate OSS. Business plans (Free / Pro / Team) are in [README](../README.md#plans-roadmap).

## Architecture roles

| Component | Purpose | When to use |
|-----------|---------|-------------|
| **Probe** (`@costgate/probe`) | Measure token usage, JSONL logs | Development / baseline only |
| **Gate** (`costgate-gate`) | Filter `tools/list`, delegate calls | Production (daily Cursor) |
| **Dashboard** (`npm run dashboard`) | MCP / tool stats, recommendations, control | Local Web UI (Phase 23+) |
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
| **23. Dashboard read-only** | ✅ Done | Local Web UI — metrics, stale tools, recommendations |
| **24. Dashboard control** | ✅ Done | Tool overrides, mcp.json enable/disable |
| **25. Gate event log** | ✅ Done | Production stats without Probe |
| **26. MCP add wizard** | ✅ Done | Marketplace catalog, add wizard API/UI |
| **27. Project recommend** | ✅ Done | Repo-aware MCP suggestions |
| **28. Project-scoped dashboard** | ✅ Done | Workspace registry, per-project MCP config |
| **29. Marketplace expansion** | ✅ Done | 15+ MCP カタログ、カテゴリ UI、フィルタ |

**costgate-cloud（別 repo）:** 後回し — [Deferred](#deferred-costgate-cloud) 参照  
**Dashboard 仕様:** [dashboard.md](./dashboard.md)（利用者） / [dev/dashboard.md](./dev/dashboard.md)（開発者）  
**MCP 削減調査:** [mcp-reduction-survey.md](./mcp-reduction-survey.md)

---

## Development priority（2026-07）

**方針: OSS 本体（削減 + 可視化）を優先。costgate-cloud（ホスト型 Dashboard / Billing / Team）は OSS Dashboard 基盤の後。**

| 優先 | 領域 | 理由 |
|------|------|------|
| **1** | Gate / Probe / eval / catalog（本 repo） | 全ユーザーが直接得るトークン削減 |
| **2** | **OSS Dashboard**（Phase 23–29） | CLI 計測の UX 化・MCP ライフサイクル |
| **3** | 配布・DX（npm publish、WSL、benchmark CI） | 導入摩擦と回帰防止 |
| **4** | costgate-cloud（別 repo） | OSS Dashboard 完了後に Pro/Team 化 |

```
Phase 16–22  OSS 強化              ✅ 完了
Phase 23–27  OSS Dashboard        ✅ 完了
Phase 28     プロジェクト別設定   ✅ 完了
Phase 29     MCP マーケット拡充   ✅ 完了
Phase 30+    costgate-cloud       ← 次の主戦場（MVP は Phase 6 済み）
```

---

### Phase 1 — Probe MVP ✅

- stdio MCP proxy to GitHub (and other heavy MCPs)
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

## OSS Phase 16–22 完了 → Phase 23–28 Dashboard

Phase 16–22 の OSS ロードマップは **2026-07-05 時点で完了**。Phase 23–27 Dashboard も **2026-07 完了**。  
次の開発は **Phase 30+ costgate-cloud**（別 repo）。OSS Dashboard Phase 23–29 は完了。

- 利用者向け: [dashboard.md](./dashboard.md)
- 開発者向け: [dev/dashboard.md](./dev/dashboard.md)

## Upcoming phases (16+) — archived

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
Phase 22  Smart intent           … Probe JSONL intent
Phase 23  Dashboard read-only    … ローカル Web UI
Phase 24–27 Dashboard 拡張       … 制御・本番 log・追加・リコメンド
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
| **22. Smart intent** | ✅ Done | Probe JSONL intent + eval seed |

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

## Upcoming — OSS Dashboard (完了)

Phase 23–29 でローカル Dashboard の可視化・制御・追加・推奨・**ワークスペース別設定**・**MCP マーケット**は完了。

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **23. Dashboard read-only** | ✅ Done | `npm run dashboard`, overview / tools / mcps / recommendations API |
| **24. Dashboard control** | ✅ Done | `tool-overrides.json`, mcp.json PATCH + backup |
| **25. Gate event log** | ✅ Done | `gate-*.jsonl`, 本番統計、schema 拡張 |
| **26. MCP add wizard** | ✅ Done | `catalog/marketplace/`, 追加ウィザード |
| **27. Project recommend** | ✅ Done | リポジトリ解析による MCP 提案 |
| **28. Project-scoped dashboard** | ✅ Done | Activity Registry + ワークスペース別 read/write |
| **29. Marketplace expansion** | ✅ Done | カタログ拡充 + カテゴリ UI + フィルタ |

### Phase 23 — Dashboard read-only ✅

**目的:** 計測データを **localhost Web UI** で一覧。書き込みなし。

- `npm run dashboard` → `http://127.0.0.1:8787`（既定は外部バインド不可）
- データ: Probe JSONL, `usage.json`, `backends.json`, `mcp.json`, tier catalog
- 画面: Overview, Tools, MCPs, Recommendations（削除候補）
- API: `GET /api/overview`, `/api/tools`, `/api/mcps`, `/api/recommendations`
- 計測圏外 MCP（Gate/Probe 外の直結サーバー等）に blind spot バッジ
- Test: API スナップショット + fixture logs

### Phase 24 — Dashboard control ✅

**目的:** ダッシュボードから Gate ツール / MCP サーバーの ON・OFF。

- `~/.costgate/tool-overrides.json` — `force_tier: hidden` で Gate から完全非表示
- Gate: `TierHidden` + `overrides` パッケージ
- `PATCH /api/tools/:name` — ツール hide/unhide
- `PATCH /api/mcps/:name` — mcp.json + `mcp-disabled.json` で退避・復元
- `mcp.json.bak` 自動バックアップ
- `COSTGATE_DASHBOARD_TOKEN` で書き込み保護（未設定時は localhost のみ）
- Test: `npm run test:dashboard:control`

### Phase 25 — Gate event log ✅

**目的:** Probe OFF 本番でもトークン・圧縮統計を追跡。

- Gate が `gate-*.jsonl` を出力（`tools_list`, `tool_call`, compress 効果）
- `@costgate/schema` に `gate_event` 型追加、[log-schema.md](./log-schema.md) 更新
- Dashboard が Probe + Gate ログをマージ表示

### Phase 26 — MCP add wizard ✅

**目的:** テンプレートから MCP 設定を生成し、導入コストを即表示。

- `catalog/marketplace/*.json` — 手動キュレーション（github, filesystem, browser）
- `GET /api/marketplace?q=` — カタログ検索
- `POST /api/mcps` — `{ template, env }` で backends.json 追加（backup 付き）
- ダッシュボード UI: 検索 → テンプレ選択 → env フォーム → コスト試算 → 追加
- Test: `npm run test:dashboard:marketplace`
- 外部レジストリ: Phase 29d（旧 26b 案）

### Phase 27 — Project recommend ✅

**目的:** ワークスペース構成から MCP 追加・削除を提案。

- シグナル: `package.json`, `go.mod`, `.cursor/rules`, 既存 `mcp.json`
- `recommend_add` / 既存 Phase 23 削除推奨との統合 UI
- 外部 API 不要（ローカル解析のみ）
- Test: `npm run test:dashboard:project-recommend`
- Env: `COSTGATE_PROJECT_ROOT` でスキャン対象を上書き

### Phase 28 — Project-scoped dashboard ✅

**目的:** Cursor で CostGate を使う **ワークスペースごと** に MCP 設定・Enable・Filesystem PATH を Dashboard から管理する。

**プロジェクト一覧の方針（Activity Registry）**

ディスクスキャンや手動 `projects.json` ではなく、**Gate が実際に起動した workspace** を registry に記録する。

| ソース | 役割 |
|--------|------|
| **Activity Registry** | Gate 起動時に `COSTGATE_PROJECT_ROOT`（=`${workspaceFolder}`）を `~/.costgate/workspace-registry.json` へ記録（メイン） |
| **Pin** | 未使用だが先に設定したいパスを少数登録（任意） |
| **Current** | Dashboard 起動時の cwd / `COSTGATE_PROJECT_ROOT` |

**やらないこと:** `~/work` 以下の git 全スキャン、Cursor 内部 DB 直接解析、`COSTGATE_WORKSPACE_ROOTS` を主一覧源にすること。

**設定レイアウト（ワークスペース単位）**

```
<workspace>/
  .costgate/
    backends.json          ← MCP 定義（Filesystem ALLOWED_PATH 含む）
    tool-overrides.json
    mcp-disabled.json      ← プロジェクト別 enable 状態（案）
    usage.json             ← 任意
    logs/                  ← 任意
```

**`cursor:production` の変更（28b）**

```json
"env": {
  "COSTGATE_PROJECT_ROOT": "${workspaceFolder}",
  "COSTGATE_CONFIG": "${workspaceFolder}/.costgate/backends.json",
  "COSTGATE_TOOL_OVERRIDES": "${workspaceFolder}/.costgate/tool-overrides.json",
  "COSTGATE_USAGE_PATH": "${workspaceFolder}/.costgate/usage.json"
}
```

**Dashboard API（案）**

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/api/workspaces` | registry 一覧（`last_seen` 順） |
| `POST` | `/api/workspaces/pin` | パスを Pin |
| `GET` | `/api/workspaces/:id/overview` | スコープ付き overview |
| `GET/PATCH/POST` | `/api/workspaces/:id/mcps` … | Phase 24–26 の workspace 版 |

**サブフェーズ**

| 段階 | 内容 |
|------|------|
| **28a** | Gate → registry 書き込み + `GET /api/workspaces` |
| **28b** | `cursor:production` を `${workspaceFolder}` ベースに移行 |
| **28c** | Dashboard プロジェクト選択 UI + スコープ付き read/write |
| **28d** | Pin folder UI、グローバル `~/.costgate/` からの移行ガイド |

**マルチルート:** Cursor マルチルート workspace ではフォルダごとに `${workspaceFolder}` が変わるため、各ルートに `.costgate/` を置く。

**Test:** `npm run test:dashboard:workspaces`（新規）

### Phase 29 — Marketplace expansion ✅

**目的:** Add MCP 画面を **発見しやすいマーケット** にする。Phase 26a の 3 テンプレ（github / filesystem / browser）から拡張。

**現状（Phase 26a ✅）:** 静的 JSON 3 件、テキスト検索のみ、カテゴリ表示は card meta 程度。

#### カタログ拡充（29a）

[mcp-reduction-survey.md](./mcp-reduction-survey.md) の優先度に基づき `catalog/marketplace/*.json` を追加。各エントリに **tier catalog または compare 試算** を可能な限り付与。

| カテゴリ | 追加候補 MCP | 優先 |
|---------|-------------|------|
| **devtools / vcs** | Git ✅, Git（公式 Ref）, GitLab | P1 |
| **filesystem** | Filesystem ✅ | — |
| **browser** | Browser ✅, Playwright（Microsoft） | P1 |
| **database** | PostgreSQL, SQLite | P2 |
| **search** | Fetch, Brave Search, Tavily / Exa | P2 |
| **saas** | Linear, Notion, Slack | P3 |
| **cloud / infra** | Docker, Azure MCP（namespace モード注記） | P3 |
| **ai / memory** | Memory, Sequential Thinking | P3 |

**目標:** 初版 **15+ テンプレ**、調査ドキュメント P1–P2 を網羅。

テンプレ JSON に追加フィールド（案）:

```json
{
  "category": "database",
  "category_label": "Database",
  "popularity": "high",
  "official": true,
  "gate_ready": true,
  "docs_url": "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres"
}
```

#### 機能別グルーピング（29b）

| 変更 | 内容 |
|------|------|
| **API** | `GET /api/marketplace?category=database` — カテゴリフィルタ |
| **API** | レスポンスに `categories: [{ id, label, count }]` を付与 |
| **UI** | カテゴリタブ / サイドバー（All · DevTools · Browser · Database · Search · SaaS · Cloud · AI） |
| **UI** | カードに `official` / `gate_ready` / `popularity` バッジ |

カテゴリ定数（案）:

| `category` | 表示名 | 例 |
|------------|--------|-----|
| `devtools` | DevTools & VCS | GitHub, Git |
| `filesystem` | Filesystem | server-filesystem |
| `browser` | Browser & E2E | Cursor Browser, Playwright |
| `database` | Database | Postgres, SQLite |
| `search` | Search & Fetch | Fetch, Brave |
| `saas` | SaaS & Team | Linear, Notion, Slack |
| `cloud` | Cloud & Infra | Docker, Azure |
| `ai` | AI & Memory | Memory |

#### マーケット画面の充実（29c）

| 機能 | 説明 |
|------|------|
| **ソート** | 人気順 / 名前 / 削減率（`compare_estimate.reduction_pct`） |
| **フィルタ** | Gate 対応のみ / 公式のみ / 要シークレット除外 |
| **詳細パネル** | ツール数・削減試算・required_env・ドキュメントリンク |
| **重複警告** | 既に `backends.json` にある MCP を「Installed」表示 |
| **カテゴリ空状態** | カテゴリごとのおすすめ 1 件を Phase 27 recommend と連携 |

#### 外部レジストリ（29d — Phase 26b 統合）

| 段階 | 内容 |
|------|------|
| **26b / 29d** | MCP Registry / Smithery API プロキシ（キャッシュ付き）— 静的 catalog の補完 |
| **29d** | 外部結果と手動キュレーションのマージ表示（`source: catalog \| registry`） |

**Test:** `npm run test:dashboard:marketplace` 拡張（カテゴリフィルタ、15+ fixture、UI snapshot 任意）

**関連:** Phase 19（tier catalog + smoke）— 新 MCP は marketplace 追加前に tier / compare パターンを推奨。

---

## Deferred — costgate-cloud

**ステータス: 後回し。** OSS Phase 16–22 が一段落してから [costgate-cloud](https://github.com/YukiMiyatake/costgate-cloud) で再開。

| Phase | 内容 | 前提 |
|-------|------|------|
| **30 Dashboard** | ホスト型 Web UI（履歴・チーム）— OSS Phase 23–25 を拡張 | OSS Dashboard + eval JSON 安定 |
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

1 ターンの合計 ≈ システム/会話 + **ツール定義（固定）** + **ツール結果（変動）** + 他 MCP。

| 使い方 | Gate による全体削減の目安 |
|--------|---------------------------|
| 短い会話・定義が効きやすい | **15〜30%** |
| 通常のコーディング | **5〜15%** |
| 長い会話 + 大きな tool 結果 | **3〜8%** |
| 他 MCP 定義が支配的 | **1〜5%**（Gate 対象 MCP 分のみ削減） |

例: 1 ターン 20,000 tokens のうち GitHub 定義 ~4,000 → Gate で ~3,000 削減 → **全体 ~15%**。

`npm run compare` は **定義レイヤのみ**。変動コスト込みは **Phase 7** / **Phase 9**（`compress-report`）。

**フェーズ別の実測値・性能:** [benchmarks.md](./benchmarks.md)

### 削減対象の整理

| 対象 | OSS 現状 | 備考 |
|------|----------|------|
| MCP ツール定義（Gate 対象 MCP） | ✅ filter + catalog + dynamic + probe intent | Phase 16–22 完了 |
| MCP ツール実行結果 | ✅ compress + code-mode + JSON summary + dedupe | Phase 20 |
| ファイル読取の出力量 | ✅ go/ast + scanner outline | Phase 16 |
| 削減の品質保証 | ✅ eval 21/21 + live optional | Phase 17 |
| 計測ドリフト・回帰 | ✅ benchmark CI | Phase 18 |
| Multi-MCP | ✅ github + mock + filesystem catalog | Phase 19 |
| 会話・rules | ❌ 未計画 | Out of scope |
| Gate/Probe 外の直結 MCP | ❌ 計測対象外 | Dashboard blind spot |
| MCP 可視化・制御 | ✅ Phase 23–24 | ローカル Dashboard（OSS） |
| 可視化・課金（cloud） | MVP のみ | **Phase 30+ 後回し** |

### Pro / Team プランとの関係

| Plan | 現状 | 次の一手（優先順） |
|------|------|-------------------|
| **Free (OSS)** | Gate 削減 + Probe + CLI + eval + Dashboard（Phase 23–29 完了） | **Phase 30+ costgate-cloud** |
| **Pro** | cloud MVP（手動 upload） | Phase 30+ ホスト Dashboard（OSS 23–25 拡張） |
| **Team** | — | Phase 32–33（後回し） |

Pro/Team の新機能開発は **OSS Phase 29 完了後**に costgate-cloud 再開。既存 `cloud:upload` / Reporter はメンテのみ。

---

## Phase 31+ — Shield & MCP Trust（計画）

MCP 経由機密漏洩防止 + MCP ごと信頼度。詳細: [docs/dev/shield-trust.md](./dev/shield-trust.md)

| Phase | 内容 | 状態 |
|-------|------|------|
| **31** | Gate redact/unredact + `mcp-trust.json` + Dashboard | 計画 |
| **32** | `preToolUse` Read サニタイズ（コード隠匿） | 計画 |
| **33** | `beforeSubmitPrompt` secret 検出ブロック | 計画 |
| **34** | プロンプト自動 redact（Cursor API 待ち） | 待機 |
| **35** | チャット UI 復元（Cursor API 待ち） | 待機 |

---

## Out of scope

| Item | Notes |
|------|-------|
| Prompt / rules optimization | **Not scheduled** — conversation token reduction |
| Shield prompt UI restore | Phase 35 — Cursor `afterAgentResponse` API 待ち |

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
npm run dashboard          # Phase 23+
```
