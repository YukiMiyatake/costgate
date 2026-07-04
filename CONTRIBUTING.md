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
| `develop` | 日常開発・push 先（デフォルト） |
| `main` | 安定版。`develop` から PR でマージ |
| `feature/*` | 機能ブランチ（`develop` 向け PR） |

```bash
git checkout develop
git pull
# … 作業 …
git push origin develop
# リリース時: develop → main の PR を作成
```

**`main` への直接 push はしない**（PR 経由）。

## Log schema changes

1. Edit `packages/schema/log-event.schema.json` (source of truth)
2. Update `docs/log-schema.md` (human docs)
3. Rebuild `@costgate/schema` and consumers

## npm publish (maintainers)

```bash
npm publish -w @costgate/probe --access public
```

Gate releases use goreleaser from `packages/gate` (TODO).
