# Gate mode (`filter` vs `transparent`)

> **Languages:** English (this file) · [日本語](./ja/gate-mode.md)

CostGate Gate sits **in front of your backend MCPs** (GitHub, filesystem, etc.).  
`COSTGATE_GATE_MODE` controls whether Gate **reduces the tool list** exposed to the AI.

**Separate from gate mode:** response **compression**, **code-mode**, and **Shield** can run in either mode.

---

## Quick comparison

| | `transparent` | `filter` |
|---|---------------|----------|
| **tools/list** | All backend tools passed through | Tier A/B/C + meta tools only |
| **Token savings (tool definitions)** | None | High (often 50–80% fewer list tokens) |
| **tools/call** | Direct proxy | Direct proxy (+ optional `invoke_tool` meta path) |
| **Compression / code-mode** | ✅ if enabled | ✅ if enabled |
| **Shield redact** | ✅ if enabled | ✅ if enabled |
| **Default in `costgate init`** | ✅ yes | no |

**Default today:** `transparent` — safer first run (all tools visible). Enable `filter` when you want maximum token reduction.

---

## `transparent` mode

- Gate forwards the backend’s full `tools/list` to Cursor.
- Still useful with **compression** (`COSTGATE_COMPRESS=1`) and **code-mode** to shrink **tool results**.
- Good for: debugging, comparing before/after, or when you need every tool name visible.

Log line example:

```text
[costgate-gate] transparent mode: 26 tools from [github]
```

---

## `filter` mode

Gate exposes a **smaller tool list** using Tier classification:

| Tier | Typical share | In `tools/list` |
|------|---------------|-----------------|
| **A** | ~35% | Always visible |
| **B** | ~35% | Depends on **exposure mode** + **intent** |
| **C** | ~30% | Hidden unless exposure + intent allow |

### Meta tools (always in filter mode)

| Tool | Purpose |
|------|---------|
| `discover_tools` | Search hidden tools by keyword |
| `invoke_tool` | Call a tool not currently in the list |

So the AI can still reach Tier B/C tools **on demand** without loading every definition up front.

### Exposure modes (`COSTGATE_EXPOSURE_MODE`)

| Mode | Tier A | Tier B | Tier C |
|------|--------|--------|--------|
| `permissive` (default) | always | always | when intent matches |
| `conservative` | always | when intent matches | when intent matches |
| `aggressive` | always | top-N intent-matched B (`COSTGATE_EXPOSURE_MAX_B`, default 5) | rare |
| `budget` | capped by estimated list tokens (`COSTGATE_EXPOSURE_TOKEN_BUDGET`) | | |

### Intent sources (dynamic tool exposure)

Gate combines keywords from:

- `COSTGATE_INTENT` — static env
- **Usage history** — `~/.costgate/usage.json` (`COSTGATE_INTENT_DYNAMIC=1`)
- **Probe logs** — recent tool calls in JSONL (`COSTGATE_INTENT_PROBE=1`)
- **Prompt intent** — Cursor `beforeSubmitPrompt` hook → `~/.costgate/prompt-intent/latest.json` (`COSTGATE_INTENT_PROMPT=1`)

After each `tools/call`, Tier B exposure can refresh.

---

## What runs regardless of gate mode

| Feature | Env | Default in `init` | Effect |
|---------|-----|-------------------|--------|
| Response compression | `COSTGATE_COMPRESS` | `1` | Truncate large tool results |
| Code-mode outlines | `COSTGATE_CODE_MODE` | `1` | Source files → signature outline |
| Shield (MCP redact) | `COSTGATE_SHIELD` | `1` | Mask secrets in MCP traffic |
| Dashboard | `COSTGATE_DASHBOARD_AUTO` | `1` | Local UI on Gate start |

---

## How to switch mode

### 1. Dashboard (recommended)

Open Dashboard → **Gate settings** → set `gate_mode` to `filter` or `transparent`.  
**Restart Gate MCP** after changing `gate_mode` (hot-reload does not apply to mode).

### 2. Config file

Global: `~/.costgate/gate-settings.json`  
Per project: `<workspace>/.costgate/gate-settings.json`

```json
{
  "gate_mode": "filter",
  "exposure_mode": "permissive"
}
```

### 3. Environment (mcp.json)

```json
{
  "mcpServers": {
    "costgate-gate": {
      "env": {
        "COSTGATE_GATE_MODE": "filter"
      }
    }
  }
}
```

---

## Choosing a mode

| Goal | Suggested mode |
|------|----------------|
| Maximum token reduction | `filter` + `permissive` or `conservative` |
| First-time setup / debugging | `transparent` |
| Large tool results only | `transparent` + compress + code-mode |
| Strict tool surface | `filter` + `conservative` or `budget` |

---

## Related

- [packages/gate/README.md](../packages/gate/README.md) — env reference
- [dashboard.md](./dashboard.md) — Gate settings UI
- [installation.md](./installation.md) — platform setup
