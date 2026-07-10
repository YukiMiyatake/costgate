# Repository structure

> **Languages:** English (this file) · [日本語](./ja/structure.md)

CostGate OSS is a **monorepo**. Gate (Go binary) and the npm entry layer (`@costgate/cli`) live in one repository.

```
costgate/
├── packages/
│   ├── schema/          @costgate/schema   — shared log schema (npm, internal)
│   ├── probe/           @costgate/probe    — measurement MCP (npm publish)
│   ├── cli/             @costgate/cli     — npm entry (launcher, Dashboard, hooks)
│   └── gate/            costgate-gate      — gateway MCP (Go binary, goreleaser)
├── catalog/marketplace/ MCP カタログ（CLI runtime に同梱）
├── docs/
├── examples/
├── scripts/             開発用（publish 時は packages/cli/runtime にコピー）
└── package.json         npm workspaces root (private)
```

## Distribution model

| Layer | Publish | User entry |
|-------|---------|------------|
| **Gate** | GitHub Releases (`costgate-gate_*`) | `@costgate/cli init` がダウンロード |
| **CLI** | npm `@costgate/cli` | `npx @costgate/cli init` |
| **Probe** | npm `@costgate/probe` | 計測時のみ `npx @costgate/probe` |

## Why monorepo (not separate repos)

| Concern | Answer |
|---------|--------|
| npm publish `@costgate/cli` / `@costgate/probe` | Works from `packages/*` in monorepo |
| Go binary for Gate | Built from `packages/gate` in same repo |
| Dashboard / hooks in npm | `packages/cli` build copies `scripts/` + `catalog/` |
| Version sync | One tag `v*` → Gate binary + schema + probe + cli |

Gate releases via GitHub Releases (goreleaser). npm packages publish on the same tag via `npm-publish.yml`.

## Related repo

| Repo | Role |
|------|------|
| [costgate](.) | OSS — Probe + Gate + CLI (**CostGate engine**) |
| [costgate-cloud](../costgate-cloud) | Private — **LoopGate** SaaS (loops, gateway, billing) |

## Ecosystem (LoopGate)

| Product | Repo | Public |
|---------|------|--------|
| **CostGate** | `costgate` (this repo) | Yes — MCP gateway, Shield, local Dashboard |
| **LoopGate** | `costgate-cloud` | No — Hosted LoopOps, LLM proxy, org policies |

- OSS stays the **engine** (`costgate init`, Gate MCP, hooks).
- SaaS runs **Issue → PR loops** with hosted Claude API (see costgate-cloud `docs/product/loopgate.md`).
- **Feature split (OSS free vs Cloud paid):** [docs/ecosystem/plans.md](./ecosystem/plans.md)
- Do **not** merge OSS + cloud into one repo (license, release cadence, visibility differ).

Full layout: costgate-cloud `docs/repository-structure.md`.
