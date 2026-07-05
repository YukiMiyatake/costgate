# MCP Dashboard（利用者向け）

CostGate の **ローカル Web ダッシュボード** で、MCP とツールの利用状況・トークン削減効果を確認し、不要な MCP / ツールの整理や追加を行います。

> **ステータス:** Phase 29 まで実装済み。  
> 開発者向けの仕様は [docs/dev/dashboard.md](./dev/dashboard.md) を参照。

---

## 何ができるか

| 機能 | 説明 | 予定フェーズ |
|------|------|-------------|
| **利用状況の可視化** | MCP / ツール別の呼び出し回数・最終利用日 | Phase 23 |
| **トークン・削減量** | `tools/list` 固定コストと Gate による削減の推定 | Phase 23 |
| **休眠ツールの検出** | 長期間使われていないツールの一覧 | Phase 23 |
| **削除推奨** | コストが高いのに使われていない MCP / ツールの提案 | Phase 23 |
| **ツールの有効 / 無効** | Gate 経由ツールをダッシュボードから隠す | Phase 24 ✅ |
| **MCP の有効 / 無効** | `mcp.json` の MCP を ON / OFF（要 Cursor 再起動） | Phase 24 ✅ |
| **MCP の追加** | ウィザードで設定ファイルを生成 | Phase 26 ✅ |
| **MCP マーケット** | カテゴリ別一覧・15+ MCP カタログ・フィルタ | Phase 29 ✅ |
| **おすすめ MCP** | プロジェクト構成に応じた提案 | Phase 27 ✅ |
| **プロジェクト別 MCP 設定** | ワークスペースごとの Enable / PATH / backends | Phase 28 ✅ |

---

## 起動方法

```bash
npm run dashboard
# → http://127.0.0.1:8787 （ローカルのみ。既定では外部からアクセス不可）
```

CLI でも同様の情報は取得できます（ダッシュボード実装前も利用可能）:

| コマンド | 内容 |
|---------|------|
| `npm run session-report` | セッション内訳・削減シナリオ |
| `npm run compare` | Gate ON/OFF の定義レイヤ比較 |
| `npm run compress-report` | 圧縮・Code Mode の効果 |

---

## 画面イメージ

### Overview（概要）

- 直近 7 / 30 日の推定トークン
- Gate による `tools/list` 削減率
- 固定コスト（ツール定義）が全体に占める割合

### Tools（ツール）

- ツール名・呼び出し回数・最終利用日
- Tier（A / B / C）の表示
- 「90 日以上未使用」などのフィルタ

### Add MCP（ウィザード）

1. **Add MCP** タブでカタログを検索（`github`, `filesystem`, `browser` など）
2. テンプレートを選択し、必要な環境変数（例: `GITHUB_TOKEN`）を入力
3. 導入前に **tools/list コスト試算**（Gate filter 適用後の推定）を確認
4. **Add MCP** で `~/.costgate/backends.json` にエントリを追加（自動バックアップ `backends.json.bak`）

#### Filesystem MCP の `ALLOWED_PATH` とは

Filesystem MCP が **読み書きしてよいディレクトリ**（絶対パス）です。公式 `@modelcontextprotocol/server-filesystem` の起動引数になります。

| 設定例 | 意味 |
|--------|------|
| `/home/you/work/my-app` | そのプロジェクトだけにアクセスを限定（推奨） |
| リポジトリルート | `go.mod` や `package.json` があるフォルダ |

**Add MCP** ウィザードでは、ダッシュボード起動時の作業ディレクトリ（`COSTGATE_PROJECT_ROOT`）や Git ルートを **候補として自動表示**します。複数ワークスペースの場合は `COSTGATE_WORKSPACE_ROOTS=/path/a,/path/b` で追加候補を指定できます。

Gate 経由の MCP（GitHub, Filesystem）は `backends.json` に追加します。Cursor 組み込みの Browser MCP は設定画面での有効化を案内します（ファイル書き込みなし）。

書き込み API は localhost のみ（任意で `COSTGATE_DASHBOARD_TOKEN`）。

---

### MCPs（サーバー）

- Cursor に登録されている MCP 一覧
- **Gate 経由**（計測・削減対象）と **直結**（計測対象外）の区別

### Recommendations（推奨）

- **追加候補** — `package.json`（playwright）、`go.mod`、`.cursor/rules`（gh / PR）などのシグナルに基づく MCP 提案（スコア付き）
- **Gate 切替** — GitHub MCP を直結している場合、Gate 経由への切替を提案
- **削除候補** — 高い固定コストなのに使われていないもの

追加候補から **Open wizard** で Add MCP タブを開き、Phase 26 のウィザードに進めます。

### プロジェクト別設定（Phase 28 ✅）

Dashboard 上部の **ワークスペース選択** で、Cursor で Gate を使ったプロジェクトごとに MCP を管理できます:

- 一覧は Gate の **Activity Registry**（`~/.costgate/workspace-registry.json`）から自動生成
- **Pin folder** で未使用プロジェクトも登録可能
- 各ワークスペースの `<project>/.costgate/` に backends / overrides / logs を保存
- `npm run cursor:production` は `${workspaceFolder}` ベースの env を生成

詳細: [roadmap.md](./roadmap.md) Phase 28 / [dev/dashboard.md](./dev/dashboard.md)

### MCP マーケット（Phase 29 ✅）

Add MCP タブで **15+ テンプレ** をカテゴリ別に閲覧できます:

- **カテゴリタブ** — DevTools / Browser / Database / Search / SaaS / Cloud / AI
- **ソート** — 名前 / 人気 / 削減率
- **フィルタ** — Gate 対応のみ / 公式のみ / シークレット不要
- **バッジ** — Official / Gate ready / Popular / Installed

詳細: [roadmap.md](./roadmap.md) Phase 29

---

## 測定できること・できないこと

ダッシュボードは CostGate が記録したデータに基づきます。**すべての AI トークンを表示するものではありません。**

### 表示できる（Gate / Probe 経由）

- Gate 対象 MCP の `tools/list` 推定トークン
- ツール呼び出し回数・最終利用日（`usage.json`）
- Probe 計測時のセッション内訳（JSONL）
- Gate の圧縮・Code Mode による削減（Phase 25 以降は本番でも追跡）

### 表示できない・限定的なもの

| 項目 | 理由 |
|------|------|
| 会話・システムプロンプト・rules のトークン | CostGate の対象外 |
| **Gate/Probe 外の直結 MCP** の詳細 | プロキシを通らないため |
| Cursor 全体の請求トークン | IDE 内部のみ。Admin API はカテゴリ別内訳なし |
| リアルタイム本番計測（Phase 25 前） | 本番は Probe OFF が前提のため |

ダッシュボードでは、計測対象外の項目に **「計測圏外」** バッジを表示します。

---

## Enable / Disable の注意

### ツール単位（Gate）

- Gate が隠したツールは `discover_tools` / `invoke_tool` から依然として呼べます
- 変更は Gate の再起動で反映（Cursor 再起動は不要な場合あり）

### MCP サーバー単位

- `~/.cursor/mcp.json` を更新します
- **Cursor の再起動が必要** です（[examples/cursor/README.md](../examples/cursor/README.md) と同様）
- 変更前に自動バックアップ（`mcp.json.bak`）を作成します

---

## プライバシー

- ダッシュボードは **既定で localhost のみ** にバインドします
- データは `~/.costgate/` 以下のローカルファイルを読みます
- クラウドへのアップロードは **opt-in**（`npm run cloud:upload`）のみ。ダッシュボードからの自動送信は Phase 31（costgate-cloud）で別途提供予定

---

## プランとの関係

| プラン | ダッシュボード |
|--------|---------------|
| **Free (OSS)** | ローカルダッシュボード（Phase 23–27 完了、28–29 計画中） |
| **Pro** | クラウド履歴・共有（Phase 30+, costgate-cloud） |
| **Team** | チームポリシー・許可 MCP リスト（Phase 33） |

個人ユーザーは OSS のローカルダッシュボードで、可視化と最適化の大半をカバーできます。

---

## 関連ドキュメント

- [Development roadmap](./roadmap.md) — Phase 23–29, 30+
- [Architecture](./architecture.md) — Probe / Gate / 直結 MCP の役割
- [Benchmarks](./benchmarks.md) — 削減効果の実測値
- [開発者向けダッシュボード仕様](./dev/dashboard.md)
