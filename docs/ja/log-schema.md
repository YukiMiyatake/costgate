# ログスキーマ（JSONL）

> **言語:** [English](../log-schema.md) · 日本語（このファイル）

Probe、Gate、costgate-cloud で共有。1 行 1 JSON オブジェクト。

**正本定義:** [`packages/schema/log-event.schema.json`](../../packages/schema/log-event.schema.json)

## イベント種別

| `type` | 説明 |
|--------|-------------|
| `session_start` | Probe/Gate セッション開始 |
| `session_end` | セッション終了 |
| `tools_list` | `tools/list` 応答を記録 |
| `tool_call` | ツール呼び出し |
| `tool_result` | ツール応答 |
| `gate_event` | Gate 本番イベント（`event`: `tools_list` \| `tool_call` · `session_id` なし） |

## 共通フィールド（Probe）

```jsonc
{
  "type": "tool_call",
  "ts": "2026-07-04T08:00:00.000Z",
  "session_id": "uuid",
  "client": "cursor",           // cursor | claude-desktop | vscode | unknown
  "backend": "github",          // バックエンド MCP 名
  "tool": "search_code",
  "request_bytes": 256,
  "response_bytes": 4096,
  "estimated_tokens": 1200,
  "duration_ms": 45
}
```

## tools_list イベント

```jsonc
{
  "type": "tools_list",
  "ts": "2026-07-04T08:00:00.000Z",
  "session_id": "uuid",
  "tool_count": 47,
  "total_schema_bytes": 85000,
  "estimated_tokens": 21000,
  "tools": [
    { "name": "find_symbol", "schema_bytes": 1200, "estimated_tokens": 300 }
  ]
}
```

## gate_event（Gate 本番）

Probe オフ時に Gate が `gate-YYYY-MM-DD.jsonl` を出力。`session_id` はありません。

```jsonc
// tools/list 露出スナップショット
{
  "type": "gate_event",
  "event": "tools_list",
  "ts": "2026-07-04T08:00:00.000Z",
  "backend": "github",
  "tools_exposed": 8,
  "tokens_est": 1200
}

// ツール呼び出し（圧縮時は stats 付き）
{
  "type": "gate_event",
  "event": "tool_call",
  "ts": "2026-07-04T08:00:05.000Z",
  "generation_id": "gen-xyz",
  "conversation_id": "conv-abc",
  "tool": "search_issues",
  "response_bytes": 4096,
  "compressed": true,
  "saved_bytes": 32000
}
```

`generation_id` / `conversation_id` は `~/.costgate/prompt-intent/latest.json` が新鮮（既定 10 分）かつワークスペースが `COSTGATE_PROJECT_ROOT` と一致するときコピーされます。

ターン索引（Dashboard 履歴）: `~/.costgate/history/turns.jsonl` — [dev/prompt-history.md](./dev/prompt-history.md) 参照。

## 環境変数

| 変数 | 既定 | 説明 |
|----------|---------|-------------|
| `COSTGATE_PROBE_LOG_DIR` | `~/.costgate/logs` | Probe ログ出力先 |
| `COSTGATE_GATE_LOG` | `1` | Gate イベントログ ON/OFF |
| `COSTGATE_GATE_LOG_DIR` | `~/.costgate/logs` | Gate ログ出力先 |
| `COSTGATE_CLIENT` | `unknown` | クライアント識別子の上書き |
