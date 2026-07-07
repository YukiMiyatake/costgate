# MCP Dashboard (user guide)

> **Languages:** English (this file) · [日本語](../ja/dashboard.md)

CostGate's **local web dashboard** helps you inspect MCP and tool usage, token savings, and manage MCPs and tools.

> **Status:** Implemented through Phase 29.  
> Developer spec: [docs/dev/dashboard.md](./dev/dashboard.md)

---

## Features

| Feature | Description | Phase |
|---------|-------------|-------|
| **Usage visualization** | Call counts and last-used dates per MCP / tool | 23 |
| **Token savings** | Estimated `tools/list` fixed cost and Gate reduction | 23 |
| **Stale tool detection** | Tools unused for a long period | 23 |
| **Removal suggestions** | High-cost, unused MCPs / tools | 23 |
| **Tool enable / disable** | Hide Gate-backed tools from the dashboard | 24 ✅ |
| **MCP enable / disable** | Toggle MCPs in `mcp.json` (Cursor restart required) | 24 ✅ |
| **Add MCP** | Wizard to generate config files | 26 ✅ |
| **MCP marketplace** | 15+ catalog entries, categories, filters | 29 ✅ |
| **Recommended MCPs** | Suggestions based on project layout | 27 ✅ |
| **Per-project MCP config** | Workspace-scoped enable / PATH / backends | 28 ✅ |
| **Prompt intent** | Overview shows intent from Cursor Hook | 28c ✅ |
| **Gate settings** | Toggle compress / code-mode / intent from UI | 30 ✅ |

---

## Starting the dashboard

### Automatic (recommended — `@costgate/cli` / Gate MCP)

```bash
npx @costgate/cli@latest init   # first time only
```

When **costgate-gate** connects from Cursor, the dashboard starts in the background and opens the browser on first launch. Enabled via `costgate gate` (`npx @costgate/cli gate`) with `COSTGATE_DASHBOARD_AUTO=1`.

When using a cloned repo, `npm run cursor:production` behaves the same way.

| Variable | Default | Description |
|----------|---------|-------------|
| `COSTGATE_DASHBOARD_AUTO` | `1` | Start dashboard when Gate starts |
| `COSTGATE_DASHBOARD_AUTO_OPEN` | `once` | Browser: `once` (default), `always`, or `never` |
| `COSTGATE_DASHBOARD_PORT` | `8787` | Port |

Disable dashboard: `COSTGATE_DASHBOARD_AUTO=0`  
Disable browser: `COSTGATE_DASHBOARD_AUTO_OPEN=never`

### Manual (development / debugging)

```bash
npx @costgate/cli dashboard
# or after clone: npm run dashboard
# → http://127.0.0.1:8787
```

Use manual start to try the dashboard without Gate or to set a custom port / token.

CLI alternatives (available before the dashboard existed):

| Command | Content |
|---------|---------|
| `npm run session-report` | Session breakdown and savings scenarios |
| `npm run compare` | Gate ON/OFF definition-layer comparison |
| `npm run compress-report` | Compression and Code Mode effect |

---

## UI overview

### Overview

- Estimated tokens for the last 7 / 30 days
- Gate `tools/list` reduction rate
- Share of fixed cost (tool definitions) in total usage

### History (Phase 9 ✅)

- Recent prompt turns (default **50**) from `~/.costgate/history/turns.jsonl`
- Per turn: prompt preview / keywords, tools/list + tool_call token estimates, compression savings
- Correlated with Gate JSONL via `generation_id` (fallback: time window)
- Select rows and **Export selected** → JSON download

| Variable | Default | Description |
|----------|---------|-------------|
| `COSTGATE_HISTORY` | `1` | Record turns on `beforeSubmitPrompt` |
| `COSTGATE_HISTORY_LIMIT` | `50` | Max turns kept on disk |
| `COSTGATE_HISTORY_PROMPT` | `preview` | `off` / `preview` (120 chars) / `full` |

Details: [dev/prompt-history.md](./dev/prompt-history.md)

### Tools

- Tool name, call count, last used date
- Tier (A / B / C)
- Filters such as “unused for 90+ days”

### Add MCP (wizard)

1. Search the catalog on the **Add MCP** tab (`github`, `filesystem`, `browser`, etc.)
2. Pick a template and enter required env vars (e.g. `GITHUB_TOKEN`)
3. Review **tools/list cost estimate** (after Gate filter) before install
4. **Add MCP** appends to `~/.costgate/backends.json` (auto-backup `backends.json.bak`)

#### Filesystem MCP `ALLOWED_PATH`

Directories the Filesystem MCP may read/write (absolute paths). Passed as args to `@modelcontextprotocol/server-filesystem`.

| Example | Meaning |
|---------|---------|
| `/home/you/work/my-app` | Limit access to one project (recommended) |
| Repository root | Folder containing `go.mod` or `package.json` |

The wizard suggests `COSTGATE_PROJECT_ROOT` or Git root. For multiple workspaces: `COSTGATE_WORKSPACE_ROOTS=/path/a,/path/b`.

Gate-backed MCPs (GitHub, Filesystem) go in `backends.json`. Built-in Cursor Browser MCP is documented in the UI only (no file write).

Write APIs are localhost-only (optional `COSTGATE_DASHBOARD_TOKEN`).

---

### MCPs (servers)

- MCPs registered in Cursor
- **Via Gate** (measured / reduced) vs **direct** (outside measurement)

### Recommendations

- **Add candidates** — from `package.json` (playwright), `go.mod`, `.cursor/rules`, etc.
- **Gate switch** — suggest moving direct GitHub MCP behind Gate
- **Remove candidates** — high fixed cost but unused

**Open wizard** from add candidates opens the Phase 26 Add MCP tab.

### Per-project settings (Phase 28 ✅)

Use the **workspace selector** at the top to manage MCPs per Cursor project:

- List from Gate **Activity Registry** (`~/.costgate/workspace-registry.json`)
- **Pin folder** for projects not yet seen
- Per-workspace `<project>/.costgate/` for backends / overrides / logs
- `npm run cursor:production` generates `${workspaceFolder}`-based env

Details: [roadmap.md](./roadmap.md) Phase 28 / [dev/dashboard.md](./dev/dashboard.md)

### MCP marketplace (Phase 29 ✅)

**Add MCP** tab — 15+ templates by category:

- **Category tabs** — DevTools / Browser / Database / Search / SaaS / Cloud / AI
- **Sort** — name / popularity / reduction rate
- **Filter** — Gate-ready only / official only / no secrets required
- **Badges** — Official / Gate ready / Popular / Installed

Details: [roadmap.md](./roadmap.md) Phase 29

---

## What can and cannot be measured

The dashboard uses data CostGate records. **It does not show all AI tokens.**

### Measurable (via Gate / Probe)

- Estimated `tools/list` tokens for Gate-backed MCPs
- Tool call counts and last used (`usage.json`)
- Probe session breakdown (JSONL) when Probe is enabled
- Compression / Code Mode savings (tracked in production from Phase 25+)

### Limited or not shown

| Item | Reason |
|------|--------|
| Chat, system prompt, rules tokens | Outside CostGate scope |
| **Direct MCPs** (not via Gate/Probe) | No proxy path |
| Full Cursor billing tokens | IDE-internal; Admin API has no per-category breakdown |
| Real-time production measurement (pre–Phase 25) | Production assumed Probe OFF |

Out-of-scope items show an **“outside measurement”** badge in the UI.

---

## Enable / disable notes

### Per tool (Gate)

- Hidden tools remain callable via `discover_tools` / `invoke_tool`
- Changes apply after Gate restart (Cursor restart may not be required)

### Per MCP server

- Updates `~/.cursor/mcp.json`
- **Cursor restart required** (see [examples/cursor/README.md](../examples/cursor/README.md))
- Auto-backup `mcp.json.bak` before changes

---

## Privacy

- Dashboard binds to **localhost by default**
- Reads local files under `~/.costgate/`
- Cloud upload is **opt-in** only (`npm run cloud:upload`); no automatic upload from the dashboard

---

## Plans

| Plan | Dashboard |
|------|-----------|
| **Free (OSS)** | Local dashboard (Phases 23–29 complete) |
| **Pro** | Cloud history / sharing (Phase 30+, costgate-cloud) |
| **Team** | Team policies / allowed MCP lists (future) |

Individual users get most visibility and optimization from the OSS local dashboard.

---

## Related docs

- [Development roadmap](./roadmap.md)
- [Architecture](./architecture.md)
- [Benchmarks](./benchmarks.md)
- [Developer dashboard spec](./dev/dashboard.md)
