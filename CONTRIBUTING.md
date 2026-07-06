# Contributing to CostGate

> **Languages:** English (this file) · [日本語](docs/ja/CONTRIBUTING.md)

## Monorepo layout

| Path | Language | Publish |
|------|----------|---------|
| `packages/schema` | TypeScript | workspace only (for now) |
| `packages/probe` | TypeScript | npm `@costgate/probe` |
| `packages/cli` | JavaScript | npm `@costgate/cli` |
| `packages/gate` | Go | GitHub Releases binary |

**One repository is enough.** npm and Go binary are published from different paths in the same repo.

## Development setup

### Option A — End user (`@costgate/cli`)

```bash
npx @costgate/cli@latest init
```

### Option B — Host (Node 20+, Go 1.22+ optional)

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build
```

### Option C — Docker (no host Node/Go required)

```bash
chmod +x docker.sh
./docker.sh npm install
./docker.sh npm run build
./docker.sh npm run build:gate
./docker.sh node scripts/cursor-mcp.mjs production
```

Or `npm run docker:setup` when npm is on the host.

Updates: `npm run docker:update` — see [docs/docker.md](./docs/docker.md)

### Option D — Dev Container (Cursor / VS Code)

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

## npm scripts

Run `npm run help` for the full list.

| Purpose | Command |
|---------|---------|
| Production install | `npx @costgate/cli init` |
| Build | `npm run build` / `build:gate` / `build:cli` |
| Cursor production | `cursor:production` / `cursor:measurement` |
| Dashboard | `dashboard` (manual) / auto on Gate start |
| Registry hook | `cursor:registry` |
| Reports | `compare` / `compress-report` / `session-report` |
| CI-equivalent tests | `npm test` or `npm run test:ci` |
| Full local tests | `npm run test:local` |
| Ship PR | `npm run feat:ship -- -m "…"` |

Legacy aliases: `registry:install-cursor-hook` → `cursor:registry`, `test:dashboard:all` → `dashboard:test`

## Branch policy

| Branch | Role |
|--------|------|
| `main` | Default stable branch; merge target for feature PRs |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | Feature branches; one PR each to `main` |

The `develop` branch is **not used**.

### Daily workflow

**One feature = one branch = one PR** to `main`. Use the automation scripts:

```bash
# First time: enable hooks (blocks direct push to main)
npm run hooks:install

# Create branch only
npm run feat:start -- gate-filter-v2

# Commit, push, PR, auto-merge, sync local main
git add …
npm run feat:ship -- --message "description of change"
npm run feat:ship -- -m "…" --name fix/bug-name
npm run feat:ship -- -m "…" --draft
npm run feat:ship -- -m "…" --no-auto
npm run feat:ship -- -m "…" --no-wait
npm run feat:sync
```

Manual workflow:

```bash
git checkout main && git pull origin main
git checkout -b feat/short-description
# … work …
git push -u origin feat/short-description
gh pr create --base main --head feat/short-description
```

**Do not push directly to `main`** — use PRs.

### Branch naming

| Prefix | Use |
|--------|-----|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `chore/` | Build, CI, dependencies |

## Documentation i18n

- **English** is canonical at `docs/` and `README.md`
- **Japanese** mirrors live under `docs/ja/` and `README.ja.md`
- See [docs/i18n.md](./docs/i18n.md)

## Log schema changes

1. Edit `packages/schema/log-event.schema.json` (source of truth)
2. Update `docs/log-schema.md`
3. Rebuild `@costgate/schema` and consumers

## npm publish (maintainers)

Tag push `v*` triggers `.github/workflows/npm-publish.yml` (requires `NPM_TOKEN`):

1. `@costgate/schema`
2. `@costgate/probe`
3. `@costgate/cli`

See [docs/RELEASE.md](./docs/RELEASE.md). Gate binaries use goreleaser — [docs/releases.md](./docs/releases.md).
