# Contributing to CostGate

## Monorepo layout

| Path | Language | Publish |
|------|----------|---------|
| `packages/schema` | TypeScript | workspace only (for now) |
| `packages/probe` | TypeScript | npm `@costgate/probe` |
| `packages/gate` | Go | GitHub Releases binary |

**One repository is enough.** npm and Go binary are published from different paths in the same repo.

## Development setup

### Option A — Host (Node 20+, Go 1.22+ optional)

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build
```

### Option B — Docker（ホスト Node/Go 不要・推奨）

```bash
chmod +x docker.sh
./docker.sh npm install
./docker.sh npm run build
./docker.sh npm run build:gate
./docker.sh node scripts/cursor-mcp.mjs production
```

または `npm run docker:setup`（ホストに npm がある場合）。

更新: `npm run docker:update` — 詳細は [docs/docker.md](./docs/docker.md)

### Option C — Dev Container (Cursor / VS Code)

Command Palette → **Dev Containers: Reopen in Container**

See [docs/docker.md](./docs/docker.md) for details.

### Probe

```bash
npm run dev:probe
```

### Gate

```bash
npm run build:gate
# → packages/gate/bin/costgate-gate
```

## Branch policy

| Branch | Role |
|--------|------|
| `main` | デフォルト・安定版。feature PR のマージ先 |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | 機能ブランチ。`main` 向け PR を 1 本ずつ |

`develop` ブランチは **使わない**（PR #1 マージ後に廃止）。

### Daily workflow

**1 機能 = 1 ブランチ = 1 PR**（`main` 向け）。自動化スクリプトを使う:

```bash
# 初回: フックを有効化（main への直接 push を拒否）
npm run hooks:install

# ブランチだけ作る
npm run feat:start -- gate-filter-v2

# コミット・push・PR・auto-merge・local main 同期を一括（main 上なら feat ブランチを自動作成）
git add …
npm run feat:ship -- --message "変更の説明"
npm run feat:ship -- -m "…" --name fix/bug-name   # ブランチ名を指定
npm run feat:ship -- -m "…" --draft               # 手動レビュー用ドラフト PR
npm run feat:ship -- -m "…" --no-auto             # auto-merge しない
npm run feat:ship -- -m "…" --no-wait             # マージ待ち・main 同期をスキップ
npm run feat:sync                                 # 開いている PR のマージ待ち + main 同期
```

手動で行う場合:

```bash
git checkout main
git pull origin main

git checkout -b feat/short-description
# … 作業・git add …

git push -u origin feat/short-description
gh pr create --base main --head feat/short-description
gh pr merge --auto --squash   # CI 通過後に自動マージ（任意）
```

### PR 自動レビュー・マージ

GitHub Actions（`.github/workflows/`）:

| Workflow | 役割 |
|----------|------|
| `ci.yml` | build + go test |
| `pr-automation.yml` | 自動レビューコメント + CI 通過後 squash auto-merge |

**初回のみ** GitHub リポジトリ設定:

1. Settings → General → **Allow auto-merge** を ON
2. （任意）Settings → Branches → `main` に **Require status checks** → `CI / build-and-test` を必須化

`npm run feat:ship` はデフォルトで **ready PR → 自動レビュー（CI）→ auto-merge → ローカル `main` 同期** まで実行します。

| ステップ | 担当 |
|----------|------|
| commit / push / PR 作成 | `feat:ship` |
| 自動レビューコメント + auto-merge キュー | `pr-automation.yml` |
| CI | `ci.yml` |
| squash merge | GitHub auto-merge |
| マージ待ち + `main` pull | `feat:ship`（`--no-wait` でスキップ） |

タイムアウト時は `npm run feat:sync` で再開できます。

マージ後（`feat:ship` / `feat:sync` が自動実行。手動の場合）:

```bash
git checkout main && git pull
git branch -d feat/short-description
git push origin --delete feat/short-description   # 任意
```

**`main` への直接 push はしない**（PR 経由）。

### Branch naming

| Prefix | Use |
|--------|-----|
| `feat/` | 新機能 |
| `fix/` | バグ修正 |
| `docs/` | ドキュメントのみ |
| `chore/` | ビルド・CI・依存関係 |

## Log schema changes

1. Edit `packages/schema/log-event.schema.json` (source of truth)
2. Update `docs/log-schema.md` (human docs)
3. Rebuild `@costgate/schema` and consumers

## npm publish (maintainers)

```bash
npm publish -w @costgate/probe --access public
```

Gate releases use goreleaser from `packages/gate` (TODO).
