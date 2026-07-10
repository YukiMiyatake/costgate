# CostGate & LoopGate — Plans (feature split)

> **Languages:** English · 詳細版（private）: costgate-cloud `docs/product/feature-matrix.md`  
> **OSS roadmap:** [roadmap.md](../roadmap.md) · **Ecosystem:** [structure.md](../structure.md#ecosystem-loopgate)

Two products, one engine:

| Product | Price | Where it runs |
|---------|-------|---------------|
| **CostGate** | **Free (MIT OSS)** | **Your machine only** — Cursor MCP gateway |
| **LoopGate** | **Paid SaaS** | AWS-hosted — LoopOps loops, org policies, billing |

---

## CostGate OSS — always free, always local

Everything below stays in the public [costgate](https://github.com/YukiMiyatake/costgate) repo under MIT.

**OSS does not use any cloud service** — no upload, no hosted API, no org policies.

| Category | Features | Status |
|----------|----------|--------|
| **MCP gateway** | Gate filter (Tier A/B/C), `discover_tools`, compression, code-mode, dynamic intent | ✅ |
| **Measurement** | Probe MCP, JSONL logs, `session-report`, `compare`, tiktoken estimates | ✅ |
| **CLI & install** | `npx @costgate/cli init`, Gate binary (GitHub Releases), Cursor hooks | ✅ |
| **Local dashboard** | Usage, savings, MCP enable/disable, marketplace, per-project config | ✅ |
| **Quality** | eval suite, benchmark CI, multi-MCP catalog | ✅ |
| **Security (planned)** | Shield redact, MCP trust (per-machine), prompt secret block | 🔜 Phase 31+ |

**Not in OSS (by design):**

- Any cloud upload or remote metrics API
- Organization / team policies
- Hosted Issue→PR loops or hosted Claude without your keys
- Stripe billing or cloud audit UI

> **Note:** [ai-issues.md](../dev/ai-issues.md) is maintainer-only automation for developing the costgate repo — not an OSS product feature.

---

## LoopGate Cloud — paid features

Commercial platform in private **costgate-cloud** repo. **Powered by CostGate.**

| Tier | Target | Key additions | Status |
|------|--------|---------------|--------|
| **Starter** | First cloud users | Limited hosted loops, cloud metrics ingest | 🔜 |
| **Pro** | Small teams | Hosted Gateway + Runner, Console, **team policies**, 90d audit | 🔜 |
| **Enterprise** | Large orgs | RBAC, BYOK, VPC runner, SIEM, Azure on contract | 🔜 |

### Cloud-only capabilities

| Feature | Starter | Pro | Enterprise |
|---------|:-------:|:---:|:----------:|
| Hosted Runner (Issue → PR) | limited | ✅ | ✅ |
| Hosted LLM Gateway (Claude proxy) | — | ✅ | ✅ + BYOK |
| LoopGate Console (`apps/web`) | — | ✅ | ✅ |
| **Org / team policies** | — | ✅ | RBAC |
| Cloud metrics API | ✅ | ✅ | ✅ |
| Cloud audit log | — | 90 days | long + SIEM |
| CI self-heal (retry cap) | — | ≤2 | custom |
| Stripe billing | — | ✅ | volume / seat |
| Batch queue (6h, max 3 issues) | — | ✅ | ✅ |

Metrics and Reporter live in **costgate-cloud** — not exposed through the OSS npm package.

---

## Quick decision guide

| You want… | Use |
|-----------|-----|
| Cut MCP token cost in Cursor | **CostGate OSS** (free, local) |
| See usage locally | **CostGate Dashboard** (free, local) |
| Run Issue→PR loops in the cloud | **LoopGate** (paid) |
| Team policies + cloud audit | **LoopGate Pro** (paid) |
| BYOK / VPC / Azure | **LoopGate Enterprise** (paid) |

---

## Related

- [Repository structure — Ecosystem](../structure.md#ecosystem-loopgate)
- [MCP Dashboard (users)](../dashboard.md)
- LoopGate product (private): costgate-cloud `docs/product/loopgate.md`

---

## Revision history

| Date | Change |
|------|--------|
| 2026-07-10 | OSS: no cloud services, no org policies; remove cloud:upload |
| 2026-07-10 | Initial public summary |
