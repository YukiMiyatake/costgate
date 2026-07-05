# Repository structure

CostGate OSS is a **monorepo**. Probe (npm) and Gate (Go binary) live in one repository.

```
costgate/
├── packages/
│   ├── schema/          @costgate/schema   — shared log schema (npm, internal)
│   ├── probe/           @costgate/probe    — measurement MCP (npm publish)
│   └── gate/            costgate-gate      — gateway MCP (Go binary, goreleaser)
├── docs/
│   ├── dashboard.md     … MCP Dashboard（利用者向け）
│   └── dev/             … 開発者向け仕様
│       └── dashboard.md
├── examples/
├── scripts/
└── package.json         npm workspaces root (private)
```

## Why monorepo (not separate repos)

| Concern | Answer |
|---------|--------|
| npm publish `@costgate/probe` | Works from `packages/probe` in monorepo |
| Go binary for Gate | Built from `packages/gate` in same repo |
| Shared log schema | `packages/schema` — single source of truth |
| Version sync | One repo, tagged releases (e.g. `v0.2.0`) |

**Separate repos are not required for npm distribution.**

Publish from workspace:

```bash
npm publish -w @costgate/probe --access public
```

Gate releases via GitHub Releases (goreleaser) from the same repo.

## When to split repos (later, optional)

- Different teams owning Probe vs Gate independently
- Different licenses
- Gate rewritten in another language with no shared code

For solo / small team development, monorepo is simpler.

## Related repo

| Repo | Role |
|------|------|
| [costgate](.) | OSS — Probe + Gate |
| [costgate-cloud](../costgate-cloud) | Private — Pro / Team / Enterprise SaaS |
