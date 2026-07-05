# MCP Dashboard — 開発者向け仕様

利用者向け概要: [docs/dashboard.md](../dashboard.md)

---

## 目的

CLI（`session-report`, `compare`, `eval`）で得られる計測・削減データを **ローカル Web UI** に集約し、MCP / ツールのライフサイクル管理（可視化 → 推奨 → 制御 → 追加）を CostGate OSS の自然な延長として提供する。

**非目標**

- Cursor / Claude の会話トークン最適化
- Gate/Probe 外の MCP のプロキシ化（計測圏外として表示のみ）
- マーケットプレイスの完全自動インストール（認証はユーザー手動）

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  Cursor                                                      │
│  ├── costgate-gate       … Gate 経由 backend                  │
│  └── その他 MCP           … mcp.json 直結 or Gate backends     │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  ~/.costgate/logs/              ~/.costgate/usage.json
  probe-*.jsonl                  backends.json
  gate-*.jsonl (Phase 25)        tool-overrides.json (Phase 24)
         │                              │
         └──────────┬───────────────────┘
                    ▼
         ┌──────────────────────┐
         │  costgate-dashboard   │  localhost:8787
         │  (Node or Go embed)   │
         └──────────────────────┘
                    │ opt-in
                    ▼
         costgate-cloud API (Phase 30+)
```

### コンポーネント配置（案）

| パス | 役割 |
|------|------|
| `packages/dashboard/` または `scripts/dashboard-server.mjs` | HTTP サーバ + 静的 UI |
| `packages/dashboard/ui/` | フロントエンド（Vite + 軽量 UI） |
| 既存 `scripts/session-report.mjs`, `compare` ロジック | メトリクス集計の再利用 |

初版は **Node のみ**（既存 scripts とのコード共有が容易）。Gate バイナリへの embed は将来検討。

---

## データソース

| ファイル / コマンド | 用途 | Phase |
|--------------------|------|-------|
| `~/.costgate/logs/probe-*.jsonl` | `tools_list`, `tool_call`, トークン推定 | 23 |
| `~/.costgate/usage.json` | `call_count`, `last_used` per tool | 23 |
| `~/.costgate/backends.json` | Gate バックエンド定義 | 23 |
| `~/.cursor/mcp.json` | 全 MCP 一覧・有効状態 | 23 |
| `catalog/tiers/*.json` | Tier A/B/C ルール | 23 |
| `npm run compare` 相当ロジック | 削減シミュレーション | 23 |
| `~/.costgate/logs/gate-*.jsonl` | 本番 Gate イベント | 25 |
| `~/.costgate/tool-overrides.json` | ツール強制 hide/show | 24 |
| `catalog/marketplace/*.json` | キュレーション MCP テンプレ | 26 |

### usage.json の制約

現状 `ToolStats` は **ツール名のみ**（backend フィールドなし）。MCP 別集計は Probe JSONL の `backend` フィールドに依存する。

```go
// packages/gate/internal/usage/store.go
type ToolStats struct {
    CallCount int64     `json:"call_count"`
    LastUsed  time.Time `json:"last_used,omitempty"`
}
```

Phase 25 で Gate event log に `backend` を含め、usage store の拡張（`backend` キー or 複合キー）を検討する。

### Gate の単一バックエンド制約

`config.PrimaryBackend()` は現状 **1 バックエンド主軸**（`github` 優先）。ダッシュボードの「MCP 別」表示は:

1. **短期:** `mcp.json` のサーバー名 + JSONL `backend` のマージ表示
2. **中期:** Gate マルチバックエンド統合（Phase 19 catalog の延長）

---

## HTTP API（案）

**ベース URL:** `http://127.0.0.1:8787`

| Method | Path | 説明 | Phase |
|--------|------|------|-------|
| `GET` | `/api/health` | 稼働確認 | 23 |
| `GET` | `/api/overview` | 期間サマリ・削減率 | 23 |
| `GET` | `/api/tools` | ツール一覧 + stats + tier | 23 |
| `GET` | `/api/mcps` | mcp.json + backends マージ | 23 |
| `GET` | `/api/recommendations` | 削除 / 追加候補 | 23 / 27 |
| `GET` | `/api/compare` | intent シナリオ別削減 | 23 |
| `PATCH` | `/api/tools/:name` | override（enabled tier） | 24 |
| `PATCH` | `/api/mcps/:name` | mcp.json enable/disable | 24 |
| `POST` | `/api/mcps` | ウィザードによる追加 | 26 |
| `GET` | `/api/marketplace` | カタログ検索 | 26 |

### レスポンス例: `GET /api/tools`

```jsonc
{
  "tools": [
    {
      "name": "search_issues",
      "backend": "github",
      "tier": "A",
      "call_count": 42,
      "last_used": "2026-07-04T10:00:00Z",
      "estimated_list_tokens": 380,
      "recommendation": null
    },
    {
      "name": "create_pull_request",
      "backend": "github",
      "tier": "C",
      "call_count": 0,
      "last_used": null,
      "recommendation": "stale_90d"
    }
  ],
  "blind_spots": ["cursor-app-control"]
}
```

---

## 削除推奨スコア（Phase 23）

ルールベース。クラウド不要。

```
stale_days     = today - last_used  (未使用は ∞)
list_cost      = tools_list 時の per-tool estimated_tokens（直近 or catalog 平均）
usage_score    = call_count / max(1, days_in_window)

recommend_delete if:
  stale_days >= 90 AND call_count == 0 AND tier == "C"
  OR stale_days >= 30 AND list_cost > P90 AND call_count == 0
  OR MCP backend entirely unused in window AND high tools/list fixed cost
```

`recommendation` 列挙値: `stale_90d`, `high_cost_unused`, `duplicate_mcp`, `gate_excluded_ok`

---

## 書き込み操作（Phase 24）

### ツール override: `~/.costgate/tool-overrides.json`

```json
{
  "version": 1,
  "tools": {
    "create_pull_request": { "force_tier": "hidden" }
  }
}
```

Gate の `catalog` / `classify` 読み込み後に overlay。既存 tier JSON は変更しない。

### MCP enable/disable

`scripts/cursor-mcp.mjs` と同パターン:

1. `mcp.json.bak` 作成
2. 対象 `mcpServers[name]` を削除 or `disabled` フラグ（Cursor 対応形式を要調査）
3. レスポンスに `requires_cursor_restart: true`

**セキュリティ:** `PATCH` / `POST` は localhost + 確認トークン（`COSTGATE_DASHBOARD_TOKEN`）または同一マシンのみ。

---

## Gate event log（Phase 25）

Probe OFF 本番でも統計を枯らさないため、Gate が軽量 JSONL を出力。

```jsonl
{"type":"gate_event","event":"tools_list","ts":"...","backend":"github","tools_exposed":8,"tokens_est":1200}
{"type":"gate_event","event":"tool_call","ts":"...","tool":"search_issues","response_bytes":4096,"compressed":true,"saved_bytes":32000}
```

| 環境変数 | 既定 | 説明 |
|----------|------|------|
| `COSTGATE_GATE_LOG` | `1` | event log ON |
| `COSTGATE_GATE_LOG_DIR` | `~/.costgate/logs` | 出力先 |

スキーマは `@costgate/schema` に `gate_event` 型を追加し [log-schema.md](../log-schema.md) を更新。

---

### マーケットプレイス JSON スキーマ（26a）

`catalog/marketplace/<id>.json`:

| フィールド | 説明 |
|-----------|------|
| `id` | テンプレート ID（`POST /api/mcps` の `template`） |
| `name`, `description` | 表示名・説明 |
| `category`, `tags` | 検索用 |
| `tier_catalog` | `packages/gate/internal/catalog/tiers/<name>.json` 参照 |
| `install_target` | `backend` \| `mcp` \| `builtin` |
| `backend_key` | `backends.json` のキー名 |
| `backend_template` | command/args/env（`${VAR}` プレースホルダ） |
| `mcp_snippet` | 任意 — 直結 MCP 用 `mcpServers` 断片 |
| `required_env` | `{ name, description, secret?, maps_to? }[]` |
| `compare_estimate` | カタログベースの fixed cost 試算（Gate 起動なし） |

### `POST /api/mcps` レスポンス例

```json
{
  "ok": true,
  "template": "github",
  "backend": "github",
  "mcp_snippet": null,
  "compare_estimate": {
    "tool_count": 26,
    "before_tokens": 3357,
    "after_tokens": 1032,
    "reduction_pct": 69.3,
    "source": "benchmarks.md — npm run compare"
  },
  "requires_cursor_restart": false,
  "backups": { "backends": "/home/user/.costgate/backends.json.bak" }
}
```

---

## MCP 追加ウィザード（Phase 26）

### フロー

1. `GET /api/marketplace?q=browser` — 静的 or 外部 API
2. ユーザーがテンプレ選択 → `POST /api/mcps` with `{ template, env: { GITHUB_TOKEN: "..." } }`
3. サーバが `backends.json` エントリ + 必要なら `mcp.json` スニペットを生成
4. `npm run compare -- --backend <name>` を内部実行し、導入コストを UI 表示

### マーケットプレイス段階

| 段階 | 実装 |
|------|------|
| 26a | `catalog/marketplace/*.json` 手動キュレーション（3 件 ✅） |
| 26b | MCP Registry / Smithery API プロキシ（→ Phase 29d） |
| 26c | npx コマンド + env チェックリスト生成 |
| **29a–29d** | カタログ拡充・カテゴリ UI・マーケット画面充実 — roadmap Phase 29 参照 |

---

## プロジェクトリコメンド（Phase 27）

ローカル静的解析のみ（外部 API 不要）。

| シグナル | パス | 推奨 |
|---------|------|------|
| `playwright` in deps | `package.json` | browser MCP |
| `go.mod` 存在 | ルート | filesystem + github |
| rules に `gh`, `PR` | `.cursor/rules/` | github MCP (Gate) |

`recommend_add` スコア = 適合度 × カタログ人気 − 重複ペナルティ − 高 fixed cost ペナルティ。

---

## プロジェクトスコープ Dashboard（Phase 28）

**目的:** Cursor ワークスペース（=`${workspaceFolder}`）ごとに MCP 設定・Enable・Filesystem PATH を Dashboard から管理する。

### 現状の制約（Phase 23–27）

- 読み書き先は **グローバル**（`~/.costgate/backends.json`, `~/.cursor/mcp.json`）
- Phase 27 の推奨は **1 プロジェクト分の読み取り** のみ
- プロジェクト A / B で別々の Filesystem `ALLOWED_PATH` や MCP Enable は Dashboard から不可

### プロジェクト一覧 — Activity Registry

**非目標:** ディスクスキャン、`projects.json` 手動メンテ、`~/work` 以下の git 列挙。

| ソース | 優先 | 説明 |
|--------|------|------|
| **Activity Registry** | 1 | Gate 起動時に `COSTGATE_PROJECT_ROOT` を `~/.costgate/workspace-registry.json` へ記録 |
| **Pin** | 2 | ユーザーが明示 Pin したパス（未使用 workspace 向け） |
| **Current** | 3 | Dashboard 起動時 cwd / `COSTGATE_PROJECT_ROOT` |

Registry エントリ例:

```json
{
  "workspaces": [
    {
      "path": "/home/user/work/costgate",
      "label": "costgate",
      "last_seen": "2026-07-06T03:00:00Z",
      "has_config": true
    }
  ]
}
```

### 設定レイアウト

```
<workspace>/.costgate/
  backends.json
  tool-overrides.json
  mcp-disabled.json    # プロジェクト別 enable（案）
  usage.json           # 任意
  logs/                # 任意
```

`cursor:production`（28b）:

```json
"env": {
  "COSTGATE_PROJECT_ROOT": "${workspaceFolder}",
  "COSTGATE_CONFIG": "${workspaceFolder}/.costgate/backends.json",
  "COSTGATE_TOOL_OVERRIDES": "${workspaceFolder}/.costgate/tool-overrides.json",
  "COSTGATE_USAGE_PATH": "${workspaceFolder}/.costgate/usage.json"
}
```

### HTTP API（案）

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/api/workspaces` | registry 一覧 |
| `POST` | `/api/workspaces/pin` | パスを Pin |
| `GET` | `/api/workspaces/:id/overview` | スコープ付き overview |
| `GET` | `/api/workspaces/:id/tools` | スコープ付き tools |
| `GET` | `/api/workspaces/:id/mcps` | スコープ付き mcps |
| `PATCH` | `/api/workspaces/:id/mcps/:name` | プロジェクト別 enable/disable |
| `POST` | `/api/workspaces/:id/mcps` | ウィザード追加（ALLOWED_PATH は workspace ルートを既定） |
| `PATCH` | `/api/workspaces/:id/tools/:name` | プロジェクト別 tool override |

`:id` は workspace path の URL-safe エンコード、または registry 内 hash。

### サブフェーズ

| 段階 | 内容 |
|------|------|
| **28a** | Gate registry 書き込み + `GET /api/workspaces` |
| **28b** | `cursor:production` / examples を `${workspaceFolder}` ベースに |
| **28c** | Dashboard UI プロジェクト選択 + スコープ付き read/write |
| **28d** | Pin UI、グローバル設定からの移行ドキュメント |

### マルチルート workspace

costgate + costgate-cloud のように Cursor マルチルートを開いた場合、**フォルダごとに** `${workspaceFolder}` と `.costgate/` が分かれる。registry 上も別エントリ。

### テスト

- `npm run test:dashboard:workspaces` — registry、scoped API、fixture workspace 2 件

---

## MCP マーケット拡充（Phase 29）

**目的:** Add MCP タブを **カテゴリ別・発見しやすいマーケット** に拡張する。Phase 26a は github / filesystem / browser の 3 件のみ。

### カタログ拡充（29a）

[mcp-reduction-survey.md](../mcp-reduction-survey.md) §4 をソースに `catalog/marketplace/` を **15+ 件** へ拡張。

| カテゴリ | MCP 候補 |
|---------|---------|
| `devtools` | GitHub ✅, Git, GitLab |
| `filesystem` | Filesystem ✅ |
| `browser` | Browser ✅, Playwright |
| `database` | PostgreSQL, SQLite |
| `search` | Fetch, Brave Search, Tavily / Exa |
| `saas` | Linear, Notion, Slack |
| `cloud` | Docker, Azure MCP |
| `ai` | Memory, Sequential Thinking |

テンプレ追加フィールド（案）: `category_label`, `popularity`, `official`, `gate_ready`, `docs_url`

新 MCP は Phase 19 パターン（tier catalog → smoke → compare）を推奨。

### 機能別グルーピング（29b）

**API**

```
GET /api/marketplace?category=database&q=postgres
```

レスポンス:

```json
{
  "query": "postgres",
  "category": "database",
  "categories": [
    { "id": "devtools", "label": "DevTools & VCS", "count": 3 },
    { "id": "database", "label": "Database", "count": 2 }
  ],
  "templates": [ ... ]
}
```

**UI:** カテゴリタブ、カテゴリ内グリッド、バッジ（Official / Gate ready / Installed）

### 画面充実（29c）

- ソート: 人気 / 名前 / 削減率
- フィルタ: Gate 対応のみ、公式のみ
- 詳細: ツール数、compare 試算、env 要件、docs リンク
- Installed / 重複 MCP の表示（`backends.json` と照合）
- Phase 27 recommend との連携（カテゴリ空時のおすすめ）

### 外部レジストリ（29d = 旧 26b）

Smithery / MCP Registry API プロキシ。静的 catalog を正とし、外部は `source: registry` で補完。

### テスト

- `test/dashboard-marketplace.test.mjs` — カテゴリフィルタ、15+ catalog fixture
- 任意: Playwright smoke（カテゴリタブ切替）

---

## 実装フェーズ

| Phase | 内容 | 主な成果物 |
|-------|------|-----------|
| **23** | Read-only ローカル UI | `npm run dashboard`, `/api/overview`, `/api/tools`, `/api/recommendations` |
| **24** | 制御 | `tool-overrides.json`, mcp.json PATCH, diff + backup UI |
| **25** | 本番計測 | Gate `gate_event` JSONL, schema 更新, dashboard マージ |
| **26** | 追加 | ウィザード, `catalog/marketplace/`, marketplace API ✅ |
| **27** | リコメンド | リポジトリ解析, `recommend_add` ✅ |
| **28** | プロジェクト別 | Activity Registry, workspace 別 MCP/PATH/Enable 📋 |
| **29** | マーケット拡充 | 有名 MCP カタログ、カテゴリ UI、フィルタ 📋 |

costgate-cloud **Phase 30** は OSS Phase 23–29 の UI/API をホスト版に拡張（履歴・チーム・認証）。

---

## テスト方針

| 種別 | 内容 |
|------|------|
| 単体 | JSONL / usage パーサ、推奨スコア、API ハンドラ |
| 統合 | fixture logs + mock mcp.json → API スナップショット |
| E2E | Playwright で localhost UI smoke（Phase 23 完了時） |
| 回帰 | 既存 `session-report` / `compare` 出力との数値一致 |

---

## セキュリティチェックリスト

- [x] 既定 bind `127.0.0.1` のみ
- [ ] 書き込み API はトークン or CSRF 対策
- [x] `mcp.json` 編集前に必ず backup
- [x] `backends.json` 編集前に backup（`backends.json.bak`）
- [ ] シークレット（PAT）は UI に永続表示しない・ログに出さない
- [ ] `0.0.0.0` bind は明示 env + ドキュメント警告

---

## 関連ファイル（実装時）

| 既存 | 再利用 |
|------|--------|
| `scripts/session-report.mjs` | 集計ロジック |
| `scripts/cursor-mcp.mjs` | mcp.json 読み書き |
| `scripts/lib/paths.mjs` | `~/.costgate` パス解決 |
| `packages/gate/internal/usage/store.go` | usage + Probe import |
| `packages/schema/log-event.schema.json` | Phase 25 拡張 |

---

## 未決事項

1. **UI スタック** — Vite + 素の HTML vs 小さな React。DX とバンドルサイズのトレードオフ
2. **usage.json に backend** — 破壊的変更を避けつつ複合キー `github:search_issues` か nested map か
3. **Cursor `disabled` MCP 形式** — 公式スキーマ確認（なければエントリ削除 + backup 復元）
4. **ダッシュボードの npm パッケージ化** — `@costgate/dashboard` vs monorepo scripts のみ
