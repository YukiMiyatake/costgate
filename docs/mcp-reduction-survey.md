# MCP トークン削減調査 — よく使われる MCP と効果見込み

CostGate の製品方針（**MCP レイヤのトークン削減**）に向けた調査メモ。  
最終更新: **2026-07-05**

関連: [benchmarks.md](./benchmarks.md)（実測値） / [roadmap.md](./roadmap.md) Phase 23–28 Dashboard / [dev/dashboard.md](./dev/dashboard.md)

---

## 1. 調査の目的

| 問い | 本ドキュメントの答え |
|------|---------------------|
| どの MCP がよく使われるか | カテゴリ別の普及度（公式・コミュニティ・Cursor 定番） |
| どこに削減効果があるか | **固定コスト**（`tools/list`）と **変動コスト**（`tool_call` 結果）の両面 |
| CostGate が次に何をすべきか | catalog / 実測 / Dashboard リコメンドの優先順位 |

**対象外:** 会話・システムプロンプト・rules のトークン（CostGate のスコープ外）。

---

## 2. 削減メカニズム（おさらい）

```
1 ターンあたりの MCP 関連トークン ≈ tools/list 固定コスト + Σ tool_call 結果
```

| レイヤ | CostGate の手段 | 典型効果 |
|--------|----------------|----------|
| **定義（固定）** | Tier A/B/C、`discover_tools` / `invoke_tool`、catalog | GitHub: **~69%** 定義削減（実測） |
| **結果（変動）** | compress、Code Mode、JSON summary、dedupe | 大きい 1 call: **~83%**（実測） |

複数 MCP を同時 ON にすると、**各 MCP の `tools/list` が毎ターン合算**される。  
IDE 側ではツール数上限（例: VS Code Copilot **128 tools/request**）も報告されており、スキーマ肥大は精度・レイテンシにも悪影響。

---

## 3. 評価軸

| 軸 | 説明 | 高いほど Gate 向き |
|----|------|-------------------|
| **普及度** | Cursor / VS Code / Claude Desktop での採用頻度 | ユーザーインパクト大 |
| **ツール数** | `tools/list` で露出する tool 定義数 | 固定コスト削減余地大 |
| **スキーマサイズ** | 1 tool あたりの JSON Schema バイト数 | GitHub 系は特に大きい |
| **変動コスト** | read_file / search / snapshot 等の応答サイズ | compress / Code Mode 向き |
| **Gate 適合性** | stdio 子プロセスとして `backends.json` に載せられるか | プロキシ可能 |

**優先度スコア（定性）** = 普及度 × (固定 + 変動の削減余地) × Gate 適合性

---

## 4. 調査結果サマリー

### 4.1 第一優先 — 実測済み or テンプレ済み

| MCP | ツール数（目安） | 普及度 | 固定削減 | 変動削減 | CostGate 状態 |
|-----|----------------|--------|----------|----------|---------------|
| **GitHub** (`github/github-mcp-server`) | **26**（stdio 構成） | ◎ 最定番 | **~69%**† | ◎ search / get_file | ✅ catalog + 実測 |
| **GitHub Remote**（read toolsets） | **56+**（20 toolsets） | ○ 増加中 | 未計測（stdio の 2倍超） | ◎ | ❌ 要計測 |
| **Filesystem** (`server-filesystem`) | **9–14** | ◎ 公式 Ref | 中（Tier 設計次第） | ◎ read 系 | ✅ catalog + smoke |
| **Browser**（Cursor IDE Browser） | **~15–20** | ◎ Cursor 同梱 | 高（未実測） | ◎ snapshot HTML | 📋 catalog テンプレのみ |
| **Mock**（CI 用） | 16 | — | **~53%** | テスト用 | ✅ benchmark CI |

† [benchmarks.md](./benchmarks.md) — 26 tools, tiktoken, Gate filter 既定

### 4.2 第二優先 — よく使われるが未実測

| MCP | ツール数（目安） | 普及度 | 削減見込み | 備考 |
|-----|----------------|--------|-----------|------|
| **Playwright** (`microsoft/playwright-mcp`) | **7–25+**（実装・IDE 依存） | ◎ E2E 定番 | 固定: 高 / 変動: 中 | browser catalog の実 MCP 化が近い |
| **Fetch**（公式 Ref） | **1–3** | ○ | 固定: 低 / 変動: **高** | HTML→text の塊が variable 側 |
| **Git**（公式 Ref） | **~8–12** | ○ | 中 | log/show 結果が長くなりがち |
| **Docker** MCP | **15–30+** | ○ DevOps | 固定: 高 | inspect/logs が variable |
| **PostgreSQL / SQLite** | **5–10** | ○ | 中 | schema + query 結果 |
| **Linear / Notion / Slack** | **10–30** | ○ チーム開発 | 固定: 中〜高 | API ラッパーが増殖しやすい |
| **Brave / Tavily / Exa / Firecrawl** | **3–10** | ○ 検索 | 変動: **高** | 検索結果 JSON が肥大 |
| **Memory**（公式 Ref） | **少** | ○ | 固定: 低 | グラフ JSON が variable |

### 4.3 第三優先 — 効果は大きいがニッチ or 制約あり

| MCP | ツール数（目安） | 削減見込み | 備考 |
|-----|----------------|-----------|------|
| **Azure MCP** (`microsoft/mcp`) | **800+**（`--mode all`） | **極大** | consolidated / namespace モード推奨。Gate 単体でも Tier C 必須 |
| **Stripe / Sentry / Redis** | 中 | 中 | 業務 SaaS 連携 |
| **Google Drive** | 中 | 中〜高 | ファイル read が variable |
| **Serena** 等コード intelligence | **多**（LSP 系） | 固定: 高 potential | Gate 経由化は可能だが精度要件とトレードオフ |

### 4.4 Cursor 環境でよく並ぶ構成（典型）

```
mcp.json 典型例:
├── costgate-gate      … GitHub / filesystem 等（削減対象）
├── playwright / browser … UI 自動化
├── user-*             … ユーザー追加（DB, 検索, SaaS）
└── cursor-*           … IDE 組み込み（計測はクライアント依存）
```

**ポイント:** Gate は **1 primary backend** が現状の主軸。複数 heavy MCP を同時に Gate 化するには Phase 19 catalog のマルチバックエンド拡張が前提（[architecture.md](./architecture.md)）。

---

## 5. カテゴリ別の詳細

### 5.1 開発者ツール・VCS

| MCP | なぜ使われるか | トークン要因 | Gate 施策案 |
|-----|---------------|-------------|------------|
| **GitHub** | PR / issue / code search | 26+ 大 schema、search 結果 | ✅ Tier + intent + compress（実装済） |
| **Git** | ローカル repo 操作 | commit log、diff | catalog: log/show → C、read → A |
| **Filesystem** | ローカル read/write | 複数 read ツール、大ファイル | ✅ read Tier A、write B/C |

### 5.2 ブラウザ・Web

| MCP | トークン要因 | Gate 施策案 |
|-----|-------------|------------|
| **cursor-ide-browser** | snapshot / screenshot が巨大 | navigate+snapshot=A、screenshot=C、compress 必須 |
| **Playwright** | 20+ 操作ツール | browser.json を実ツール名に合わせて調整 |
| **Fetch** | ツール少ないが HTML 全文 | Gate 対象外でも variable は compress 向き |
| **Firecrawl / Tavily** | スクレイプ・検索 JSON | 結果 summary 化 |

### 5.3 データベース・インフラ

| MCP | トークン要因 | Gate 施策案 |
|-----|-------------|------------|
| **PostgreSQL** | schema 列挙 + 行データ | query read-only のみ A、DDL C |
| **Docker** | 多数の管理ツール | logs/inspect 結果 compress |
| **Azure** | 最大級 tool 爆発 | **Gate 必須候補** — namespace モード推奨をドキュメント化 |

### 5.4 生産性・コミュニケーション

| MCP | トークン要因 | Gate 施策案 |
|-----|-------------|------------|
| **Linear / Notion / Slack** | 一覧・検索 API | 一覧系 Tier B、mutating C |
| **Memory** | 固定小、グラフ variable | dedupe / JSON summary |

---

## 6. CostGate 実測データとの対応

| Backend | compare / benchmark | 定義 Before → After | 削減率 |
|---------|---------------------|---------------------|--------|
| github（26 tools） | `npm run compare` | ~3,357 → ~1,032 tok | **69.3%** |
| mock（16 tools） | `compare --mock` | 684 → 320 tok | **53.2%** |
| mock（CI） | `benchmark:ci` | 734 → 370 tok | **49.6%** |
| filesystem（9 tools） | `compare --mock --backend filesystem` | smoke 済、token は fixture 依存 | Tier 設計検証 |

**変動コスト（GitHub `get_file_contents` + 大 JSON）:** compress + Code Mode で **~82.6%**（[benchmarks.md](./benchmarks.md) Phase 9）。

---

## 7. 優先度マトリクス（製品ロードマップ向け）

```
                    削減効果（固定+変動）
                    低 ────────────── 高
              高  │ GitHub Remote  Azure(all)
    普          │ Playwright    GitHub✅
    及          │ Browser📋     Filesystem✅
    度          │ Linear/Slack  Fetch(var)
              低  │ Memory        SQLite
```

| 優先 | MCP / 領域 | 次のアクション |
|------|-----------|---------------|
| **P0** | GitHub（stdio） | 維持・eval 継続（済） |
| **P1** | Browser / Playwright | catalog を実 MCP で実測、`compare --backend browser` |
| **P1** | GitHub Remote（56 tools） | Probe 計測 → tier 設計（toolset 単位の隠蔽） |
| **P2** | Filesystem | 実 MCP compare を CI に追加 |
| **P2** | Fetch / 検索系 | variable compress パターンの eval タスク追加 |
| **P3** | Azure / Docker | ドキュメント + サンプル tier（採用者向け） |
| **P3** | SaaS（Notion, Linear…） | marketplace catalog（Phase 26）でキュレーション |

---

## 8. Dashboard / リコメンドへの示唆（Phase 27）

| シグナル | 推奨 MCP | 削減理由 |
|---------|---------|---------|
| `package.json` に `playwright` | Playwright / Browser | 多ツール + snapshot variable |
| `go.mod` / 大規模 repo | GitHub + Filesystem | 定義固定コストが効く |
| 既に GitHub MCP 直結 | **Gate 経由に切替** | 最大の固定削減（実測 69%） |
| Azure MCP `mode=all` | namespace / consolidated へ | 800+ tools は定義が支配的 |
| 検索 MCP 複数 ON | 1 つに絞る | 固定コストの重複 |

**削除推奨候補:** 90 日未使用 + Tier C + 高 schema バイト（Phase 23 ルール）— [dev/dashboard.md](./dev/dashboard.md)

---

## 9. 計測の進め方（未計測 MCP）

```bash
# 1. backends.json に MCP を追加
# 2. Probe でベースライン
npm run cursor:measurement
# … Cursor で数ターン作業 …
npm run session-report

# 3. Gate + compare
npm run compare
npm run compare -- --intent "your workflow"

# 4. catalog 追加
# packages/gate/internal/catalog/tiers/<backend>.json
```

新 backend は **Phase 19 パターン**（fixture smoke → catalog → `compare --mock` → live compare）に従う。

---

## 10. 参考リンク

| リソース | URL |
|---------|-----|
| 公式 Reference Servers | https://github.com/modelcontextprotocol/servers |
| GitHub MCP Server | https://github.com/github/github-mcp-server |
| GitHub Remote 56 tools レポート | https://github.com/github/gh-aw/discussions/36116 |
| Playwright MCP（Microsoft） | https://github.com/microsoft/playwright-mcp |
| Azure MCP troubleshooting（128 tool limit） | https://github.com/microsoft/mcp |
| Smithery（マーケット） | https://smithery.ai |
| MCP Registry | https://github.com/modelcontextprotocol/registry |

---

## 11. 結論

1. **最優先ターゲットは「ツール数が多く、スキーマが大きい MCP」** — GitHub・Browser/Playwright・Azure・Docker 系。
2. **CostGate は GitHub で固定 ~70%・変動 ~80% を実証済み**。同じパターンを Browser / Remote GitHub に展開する ROI が高い。
3. **Fetch / 検索系は固定は小さいが変動が大きい** — compress ・ JSON summary の延長で価値あり。
4. **複数 MCP の同時 ON は固定コストの足し算** — Dashboard（Phase 23–27）で「重複・未使用・高コスト」の可視化が製品差別化になる。
5. **catalog + 実測のループ**を MCP 種別ごとに回すことが、マーケットプレイス（Phase 26）の信頼性の土台になる。
