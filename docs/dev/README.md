# Developer documentation

> **Languages:** English (this file) · [日本語](../ja/dev/README.md)

Implementation, design, and internal specs for CostGate. User-facing guides live under [`docs/`](../).

| Document | Content |
|----------|---------|
| [dashboard.md](./dashboard.md) | MCP Dashboard — API, data sources, phased implementation |
| [prompt-intent-hook.md](./prompt-intent-hook.md) | Phase 28 — Hook design for Gate intent from conversation |
| [shield-trust.md](./shield-trust.md) | Phase 31+ — Shield (redact), MCP Trust, task list |
| [optimize-sweep.md](./optimize-sweep.md) | P6 — Batch sweep, replay fixtures, LLM-judge plan (P7+) |
| [../structure.md](../structure.md) | Repository layout |
| [../log-schema.md](../log-schema.md) | JSONL event schema |
| [../architecture.md](../architecture.md) | Probe / Gate / Cursor placement |
| [../roadmap.md](../roadmap.md) | Implementation phases |

## Separation policy

| Type | Location | Audience | Examples |
|------|----------|----------|----------|
| **User-facing** | `docs/*.md` | CostGate users | [dashboard.md](../dashboard.md), [releases.md](../releases.md) |
| **Developer** | `docs/dev/*.md` | Contributors | API specs, scoring, open questions |

Do not put internal implementation details in user docs. Link from dev docs to user docs where helpful.

## i18n

Japanese mirrors: [docs/ja/](../ja/README.md). See [docs/i18n.md](../i18n.md).
