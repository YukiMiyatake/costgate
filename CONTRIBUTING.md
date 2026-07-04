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

### Option B — Docker (no host Node/Go required)

```bash
npm run docker:build
npm run docker:gate
```

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

**1 機能 = 1 ブランチ = 1 PR**（`main` 向け）。`main` への直接 push は使わない。

```bash
git checkout main
git pull origin main

git checkout -b feat/short-description   # 例: feat/gate-filter
# … 作業・コミット …

git push -u origin feat/short-description
gh pr create --draft --base main --head feat/short-description \
  --title "短い説明" --body "## Summary\n…"
```

マージ後:

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
