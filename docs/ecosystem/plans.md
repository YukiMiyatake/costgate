# CostGate & LoopGate — Plans (feature split)

> **Languages:** English · 詳細版（private）: costgate-cloud `docs/product/feature-matrix.md`  
> **OSS roadmap:** [roadmap.md](../roadmap.md) · **Ecosystem:** [structure.md](../structure.md#ecosystem-loopgate)

Two products, one engine:

| Product | Price | Where it runs |
|---------|-------|---------------|
| **CostGate** | **Free (MIT OSS)** | Your machine — Cursor MCP gateway |
| **LoopGate** | **Paid SaaS** (Starter free tier planned) | AWS-hosted — LoopOps loops |

---

## CostGate OSS — always free

Everything below stays in the public [costgate](https://github.com/YukiMiyatake/costgate) repo under MIT.

| Category | Features | Status |
|----------|----------|--------|
| **MCP gateway** | Gate filter (Tier A/B/C), `discover_tools`, compression, code-mode, dynamic intent | ✅ |
| **Measurement** | Probe MCP, JSONL logs, `session-report`, `compare`, tiktoken estimates | ✅ |
| **CLI & install** | `npx @costgate/cli init`, Gate binary (GitHub Releases), Cursor hooks | ✅ |
| **Local dashboard** | Usage, savings, MCP enable/disable, marketplace, per-project config | ✅ |
| **Quality** | eval suite, benchmark CI, multi-MCP catalog | ✅ |
| **Security (planned)** | Shield redact, MCP trust, prompt secret block | 🔜 Phase 31+ |
| **Issue-driven AI (OSS)** | Label contract (`ai:run`, `ai:batch`), maintainer-only arming | ✅ doc · 🔜 workflows |

**Not included in OSS:** hosted Issue→PR loops, hosted Claude API without your keys, team billing, cloud audit UI.

---

## LoopGate Cloud — paid features

Commercial platform in private **costgate-cloud** repo. **Powered by CostGate.**

| Tier | Target | Key additions | Status |
|------|--------|---------------|--------|
| **Starter** | OSS users upgrading | Limited hosted loops, metrics cloud, local Gate only | 🔜 metrics ✅ |
| **Pro** | Small teams | Hosted Gateway + Runner, Console, team policies, 90d audit | 🔜 |
| **Enterprise** | Large orgs | RBAC, BYOK, VPC runner, SIEM, Azure on contract | 🔜 |

### Cloud-only capabilities (not in OSS)

| Feature | Starter | Pro | Enterprise |
|---------|:-------:|:---:|:----------:|
| Hosted Runner (Issue → PR) | limited | ✅ | ✅ |
| Hosted LLM Gateway (Claude proxy) | — | ✅ | ✅ + BYOK |
| LoopGate Console (`apps/web`) | — | ✅ | ✅ |
| Org / team policies | — | ✅ | RBAC |
| Cloud audit log | — | 90 days | long + SIEM |
| CI self-heal (retry cap) | — | ≤2 | custom |
| Stripe billing | — | ✅ | volume / seat |
| Batch queue (6h, max 3 issues) | — | ✅ | ✅ |

### Bridge (opt-in, works with free OSS)

| Feature | Description | Status |
|---------|-------------|--------|
| `npm run cloud:upload` | Send **aggregated** metrics summary only — no source code | ✅ |
| Local Reporter | Markdown from Probe JSONL (`costgate-cloud` reporter) | ✅ |

---

## Quick decision guide

| You want… | Use |
|-----------|-----|
| Cut MCP token cost in Cursor | **CostGate OSS** (free) |
| See usage locally | **CostGate Dashboard** (free) |
| Run Issue→PR loops in the cloud without managing Claude keys | **LoopGate Pro** (paid) |
| Team policies + cloud audit | **LoopGate Pro** (paid) |
| BYOK / VPC / Azure deployment | **LoopGate Enterprise** (paid) |

---

## Related

- [Repository structure — Ecosystem](../structure.md#ecosystem-loopgate)
- [Issue-driven AI design](../dev/ai-issues.md)
- [MCP Dashboard (users)](../dashboard.md)
- LoopGate product (private): costgate-cloud `docs/product/loopgate.md`

---

## Revision history

| Date | Change |
|------|--------|
| 2026-07-10 | Initial public summary aligned with costgate-cloud feature-matrix |
