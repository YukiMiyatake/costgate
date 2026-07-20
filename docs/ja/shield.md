# CostGate Shield

> **言語:** [English](../shield.md) · 日本語（このファイル）

**Shield** は **API キー・トークン・パス** が MCP や Cursor エージェント経由で漏れるリスクを下げます。

`costgate init` または `npm run cursor:registry` 後、**Cursor では既定で ON** です。

> 開発者向け設計: [dev/shield-trust.md](./dev/shield-trust.md)

---

## Shield の機能

| 層 | 場所 | 動作 |
|----|------|------|
| **プロンプトブロック** | hook `beforeSubmitPrompt` | プロンプト内の secret を検出したら **送信阻止** |
| **Read サニタイズ** | hook `preToolUse`（Read） | パス・機密を Read 引数から差し替え |
| **MCP Trust** | hook `beforeMCPExecution` | MCP ごとの信頼度で **deny / ask** |
| **Gate redact** | `costgate-gate` | MCP 要求をマスク、**vault** に保存 |
| **Gate unredact** | hook `postToolUse` | エージェント向け出力でプレースホルダ復元 |

### 検出例（ルールベース）

- GitHub PAT（`ghp_…` 等）
- OpenAI / Anthropic 形式の API キー
- AWS アクセスキー
- JWT 形式
- `api_key=…` 等の高エントロピー代入

**振る舞い解析やマルウェア検出ではありません。**  
**MCP Trust** は allow / ask / deny の **ポリシー** です。

---

## MCP Trust レベル

Dashboard → **Trust**、または `~/.costgate/mcp-trust.json`。

| レベル | 想定 | tools/call |
|--------|------|------------|
| **trusted** | CostGate、検証済み内部 MCP | 許可 |
| **standard** | 既定バックエンド（GitHub 等） | 許可（Gate で secret マスク） |
| **restricted** | コミュニティ MCP 等 | 書き込み **ask / deny** |
| **untrusted** | 未知・高リスク | 既定 **deny** |

Dashboard で MCP を無効化すると `untrusted` より強い停止です。

---

## 有効化 / 無効化

### Cursor（Shield 一式）

```bash
npx @costgate/cli@latest init
# clone 時:
npm run cursor:registry
```

### Gate の redact のみ（hooks なし）

MCP `env` に `COSTGATE_SHIELD=1` を設定。

### 無効化

`COSTGATE_SHIELD=0` と hooks の削除。

---

## 制限事項

| 未対応 | 理由 |
|--------|------|
| プロンプト自動 redact + UI 復元 | Cursor API 待ち |
| クラウド LLM へのプロンプト全面書き換え | Gate 外 |
| マルウェア **検出** | Trust ポリシーのみ |
| Claude Desktop hooks | Cursor 専用 |

---

## 関連

- [installation.md](./installation.md)
- [gate-mode.md](./gate-mode.md)
- [dev/shield-trust.md](./dev/shield-trust.md)
