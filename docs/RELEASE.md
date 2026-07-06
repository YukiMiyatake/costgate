# Release guide

> **Languages:** English (this file) · [日本語](./ja/RELEASE.md)

CostGate OSS distribution: **@costgate/cli** + Probe npm + Gate GitHub Releases.

## User install (recommended)

```bash
npx @costgate/cli@latest init
```

`init` downloads the Gate binary (GitHub Releases) and configures `mcp.json` / `hooks.json`.

## Release (maintainers)

**Prerequisite:** GitHub secret `NPM_TOKEN` (npm automation token)

```bash
npm ci && npm run build && npm run publish:check
npm run release:check   # goreleaser

git tag v0.6.0
git push origin v0.6.0
```

Tag `v*` triggers CI in parallel:

| Workflow | Output |
|----------|--------|
| `release.yml` | `costgate-gate` binaries (GitHub Releases) |
| `npm-publish.yml` | `@costgate/schema`, `@costgate/probe`, `@costgate/cli` |

## @costgate/cli — npm publish

- `prepublishOnly` copies `scripts/` + `catalog/` into `runtime/`
- **No postinstall** — binary fetch is explicit via `init` / `update`

Local dry-run:

```bash
npm run build -w @costgate/cli
npm pack -w @costgate/cli
```

## Gate — GitHub Releases

```bash
npm run build:gate
goreleaser release --clean   # or CI release.yml on tag push
```

Binary only (no Dashboard):

```bash
./scripts/install-gate.sh
# or costgate init → ~/.costgate/bin/
```

## Probe — npm

```bash
npx @costgate/probe   # measurement only
```

## Version alignment

```bash
npm run publish:check
```

`@costgate/schema`, `@costgate/probe`, and `@costgate/cli` versions must match.

## Developer Cursor switch (clone)

```bash
npm run docker:update
# or
npm run build:gate && npm run cursor:production
```

## After release

1. Update [docs/benchmarks.md](./benchmarks.md) if numbers change
2. `npm run eval -- --out test/eval/baseline.json` when adding tasks
3. Release notes: Gate binary + npm package versions
