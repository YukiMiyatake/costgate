# Gate モード（`filter` と `transparent`）

> **言語:** [English](../gate-mode.md) · 日本語（このファイル）

CostGate Gate は **バックエンド MCP**（GitHub、filesystem 等）の前段に立つプロキシです。  
`COSTGATE_GATE_MODE` は、AI に見せる **ツール一覧を減らすかどうか** を制御します。

**gate mode とは別:** レスポンス **圧縮**・**code-mode**・**Shield** はどちらのモードでも有効にできます。

---

## 一覧比較

| | `transparent` | `filter` |
|---|---------------|----------|
| **tools/list** | バックエンドの全ツールをそのまま | Tier A/B/C + メタツールのみ |
| **トークン削減（定義）** | なし | 大（リストトークン 50–80% 削減のことも） |
| **tools/call** | そのまま中継 | 中継（+ `invoke_tool` 経由も可） |
| **圧縮 / code-mode** | ✅ 有効化時 | ✅ 有効化時 |
| **Shield** | ✅ 有効化時 | ✅ 有効化時 |
| **`costgate init` の既定** | ✅ | いいえ |

**現状の既定:** `transparent` — 初回は全ツールが見える安全側。最大削減には `filter` を有効化。

---

## `transparent` モード

- バックエンドの `tools/list` をそのまま Cursor に渡す。
- **圧縮**・**code-mode** で **ツール結果** のトークンは削減可能。
- デバッグ、Before/After 比較、全ツール名が必要なとき向け。

ログ例:

```text
[costgate-gate] transparent mode: 26 tools from [github]
```

---

## `filter` モード

**Tier** 分類で `tools/list` を絞り込みます。

| Tier | 目安 | tools/list |
|------|------|------------|
| **A** | ~35% | 常に表示 |
| **B** | ~35% | **exposure mode** + **intent** で決定 |
| **C** | ~30% | 通常は非表示（条件付きで露出） |

### メタツール（filter 時は常に付与）

| ツール | 用途 |
|--------|------|
| `discover_tools` | 隠れたツールをキーワード検索 |
| `invoke_tool` | リスト外ツールを実行 |

定義を全部載せずに、必要時だけ Tier B/C にアクセスできます。

### Exposure モード（`COSTGATE_EXPOSURE_MODE`）

| モード | Tier A | Tier B | Tier C |
|--------|--------|--------|--------|
| `permissive`（既定） | 常時 | 常時 | intent 一致時 |
| `conservative` | 常時 | intent 一致時 | intent 一致時 |
| `aggressive` | 常時 | intent 一致した B の上位 N 件 | 稀 |
| `budget` | 推定リストトークン上限内 | | |

### Intent（動的露出）

- `COSTGATE_INTENT` — 静的キーワード
- **利用履歴** — `usage.json`（`COSTGATE_INTENT_DYNAMIC=1`）
- **Probe ログ** — JSONL（`COSTGATE_INTENT_PROBE=1`）
- **プロンプト intent** — Cursor hook → `prompt-intent/latest.json`（`COSTGATE_INTENT_PROMPT=1`）

`tools/call` のたびに Tier B の露出が更新されることがあります。

---

## gate mode に依存しない機能

| 機能 | 環境変数 | init 既定 | 効果 |
|------|----------|-----------|------|
| レスポンス圧縮 | `COSTGATE_COMPRESS` | `1` | 大きな tool result を短縮 |
| Code-mode | `COSTGATE_CODE_MODE` | `1` | ソースをアウトライン化 |
| Shield | `COSTGATE_SHIELD` | `1` | MCP 経由の機密マスク |
| Dashboard | `COSTGATE_DASHBOARD_AUTO` | `1` | ローカル UI |

---

## モードの切り替え

### 1. Dashboard（推奨）

Dashboard → **Gate settings** → `gate_mode`。  
**`gate_mode` 変更後は Gate MCP を再起動**（ホットリロード非対応）。

### 2. 設定ファイル

グローバル: `~/.costgate/gate-settings.json`  
プロジェクト: `<workspace>/.costgate/gate-settings.json`

```json
{
  "gate_mode": "filter",
  "exposure_mode": "permissive"
}
```

### 3. 環境変数（mcp.json）

```json
{
  "mcpServers": {
    "costgate-gate": {
      "env": {
        "COSTGATE_GATE_MODE": "filter"
      }
    }
  }
}
```

---

## 選び方

| 目的 | 推奨 |
|------|------|
| 最大のトークン削減 | `filter` + `permissive` / `conservative` |
| 初回・デバッグ | `transparent` |
| 結果だけ削減 | `transparent` + compress + code-mode |
| ツール面を厳しく | `filter` + `conservative` / `budget` |

---

## 関連

- [packages/gate/README.md](../../packages/gate/README.md)
- [dashboard.md](./dashboard.md)
- [installation.md](./installation.md)
