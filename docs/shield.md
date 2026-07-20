# CostGate Shield

> **Languages:** English (this file) · [日本語](./ja/shield.md)

**Shield** reduces the risk of **API keys, tokens, and paths** leaking through MCP tools and Cursor agent flows.

Shield is **on by default** after `costgate init` or `npm run cursor:registry` (Cursor only).

> Developer design doc: [dev/shield-trust.md](./dev/shield-trust.md)

---

## What Shield does

| Layer | Where | Behavior |
|-------|-------|----------|
| **Prompt block** | Cursor hook `beforeSubmitPrompt` | **Blocks** submit if secrets detected in your prompt |
| **Read sanitize** | Cursor hook `preToolUse` (Read) | Replaces file paths / secrets in Read tool args |
| **MCP trust** | Cursor hook `beforeMCPExecution` | **Deny / ask** based on per-MCP trust level |
| **Gate redact** | `costgate-gate` proxy | Masks secrets in MCP requests; **vault** for restore |
| **Gate unredact** | Cursor hook `postToolUse` | Restores placeholders in MCP output for the agent |

### What Shield detects (rule-based)

Examples (not exhaustive):

- GitHub PATs (`ghp_…`, `github_pat_…`)
- OpenAI / Anthropic-style API keys
- AWS access keys
- JWT-shaped tokens
- High-entropy assignment patterns (`api_key=…`)

Shield uses **pattern rules**, not behavioral malware analysis.  
**MCP Trust** is a **policy** (allow / ask / deny) — it does not scan MCP servers for malware.

---

## MCP Trust levels

Configure in Dashboard → **Trust**, or edit `~/.costgate/mcp-trust.json`.

| Level | Use for | MCP tool calls |
|-------|---------|----------------|
| **trusted** | CostGate, verified internal MCPs | Allow |
| **standard** | Default backends (e.g. GitHub) | Allow; secrets redacted at Gate |
| **restricted** | Community / less-trusted MCPs | Writes may **ask** or **deny** |
| **untrusted** | Unknown or high-risk MCPs | **Deny** by default |

Disabling an MCP in Dashboard is stronger than `untrusted` (full stop).

---

## Enable / disable

### Cursor (full Shield)

```bash
npx @costgate/cli@latest init
# or from clone:
npm run cursor:registry
```

Hooks set `COSTGATE_SHIELD=1` and `COSTGATE_SHIELD_SESSION=cursor`.

### Gate-only redact (no Cursor hooks)

In MCP `env`:

```json
{
  "COSTGATE_SHIELD": "1",
  "COSTGATE_SHIELD_SESSION": "cursor"
}
```

### Disable Shield

```json
{
  "COSTGATE_SHIELD": "0"
}
```

Remove Shield hooks from `~/.cursor/hooks.json` if you used `cursor:registry`.

---

## Dashboard

When Gate starts, Dashboard opens (once by default). Shield panel shows:

- Recent **prompt blocks** (secret type, masked snippet)
- **Sanitize preview** API for support / debugging
- Trust overview for restricted MCPs

See [dashboard.md](./dashboard.md).

---

## Limitations

| Not covered yet | Reason |
|-----------------|--------|
| Auto-redact prompt + UI restore | Cursor API gap (Phase 34–35) |
| Full prompt rewrite to cloud LLM | Outside Gate; hooks limited |
| Malware / backdoor **detection** | Trust policy only — no runtime sandbox |
| Claude Desktop hooks | Cursor-only hook model |

---

## CLI helper

```bash
npm run shield:sanitize-prompt -- "my prompt with ghp_xxxx"
```

---

## Related

- [installation.md](./installation.md) — Cursor vs Claude Desktop
- [gate-mode.md](./gate-mode.md) — tool-list filtering (separate from Shield)
- [dev/shield-trust.md](./dev/shield-trust.md) — architecture & phases
