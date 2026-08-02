## ブランチ運用

| ブランチ | 役割 |
|----------|------|
| `main` | 安定版。feature PR のマージ先 |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | 機能ブランチ（`main` 向け PR を 1 本ずつ） |

`develop` ブランチは **使いません**（リモートも削除済みを想定）。

### 役割分担

| 作業 | 担当 |
|------|------|
| commit / push / PR 作成 | ローカル・Cursor（`feat:ship`） |
| CI / レビューコメント / auto-merge | GitHub Actions |
| マージ後の main 同期 | 任意（`feat:sync`） |

### CI ティア（パス別）

すべての PR でフルの mock-MCP スイート（旧 ~20 分超）を回す必要はありません。`.github/workflows/ci.yml` が差分から job を選びます:

| 変更内容 | 実行ジョブ |
|----------|------------|
| **docs のみ**（`docs/**`, `*.md`, `examples/**` など） | `quick`（syntax + script guards） |
| **Dashboard / Cursor hooks** | `quick` + `dashboard` |
| **Gate Go**（`packages/gate/**`） | `quick` + `gate-go`（scripts/tests も触れば MCP も） |
| **MCP / scripts / tests / lockfile** | `quick` + `gate-go` + 並列 `gate-mcp` + `dashboard` |
| **`main` への push** | 常にフル |

`gate-mcp` はスイートを **並列**実行するため、壁時計は最長スイート（おおよそ 10–13 分）に抑えられます。

ローカル相当: `npm run test:ci`  
必須チェック: job id **`build-and-test`**（集約ジョブ）

### 日常ワークフロー

```bash
npm run hooks:install          # 初回: main 直 push 禁止
npm run feat:start -- short-name
git add …
npm run feat:ship -- -m "変更の説明"
npm run feat:sync                # マージ後に main を同期
```

- コミットメッセージは **日本語**
- `main` への直接 push 禁止（PR 経由）
- 詳細は英語版 [CONTRIBUTING.md](../CONTRIBUTING.md) の Branch policy を参照

### リリース

```bash
npm run release:version -- 0.6.0 --note "概要"
npm run feat:ship -- -m "chore: release v0.6.0"
# マージ後: git tag v0.6.0 && git push origin v0.6.0
```

手順: [RELEASE.md](./RELEASE.md)
