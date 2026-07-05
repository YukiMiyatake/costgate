# CostGate Gate

stdio MCP gateway (Go). Filters `tools/list` to cut token cost; delegates calls to backend MCPs.

## Build

```bash
# from repo root (requires Go 1.25+)
npm run build:gate
```

## Install (release binary, no Go)

```bash
./scripts/install-gate.sh          # latest from GitHub Releases
./scripts/install-gate.sh v0.4.0   # specific tag
costgate-gate --version
```

See [docs/RELEASE.md](../../docs/RELEASE.md).

## Modes

| `COSTGATE_GATE_MODE` | Behavior |
|----------------------|----------|
| `filter` (default) | Tier A/B/C + meta tools |
| `transparent` | Pass-through (MVP / baseline comparison) |

## Filter mode (v0.4)

- **Tier A** (~20%): always in `tools/list`
- **Tier B** (~30%): in list when intent keywords match
- **Tier C**: hidden — use `discover_tools` + `invoke_tool`
- **Meta tools** (always): `discover_tools`, `invoke_tool`
- **Dynamic intent** (default ON): recent tool usage augments `COSTGATE_INTENT`; Tier B exposure refreshes after each call
- **Probe intent** (default ON): fresh Probe JSONL `tool_call` names augment intent (`COSTGATE_INTENT_PROBE=1`)
- **Prompt intent** (default ON): Cursor `beforeSubmitPrompt` hook writes `~/.costgate/prompt-intent/latest.json` (`COSTGATE_INTENT_PROMPT=1`)
- **Response compression** (default OFF): set `COSTGATE_COMPRESS=1` to truncate large tool results
- **Code mode** (production ON): `COSTGATE_CODE_MODE=1` — source files → signature outline
- **Usage**: `~/.costgate/usage.json` (+ optional import from Probe JSONL logs)

### Tier catalog (Phase 14)

Backend-specific Tier overrides live in `internal/catalog/tiers/*.json` (embedded at build time).

| File | Backend |
|------|---------|
| `tiers/github.json` | GitHub MCP |
| `tiers/mock.json` | Integration mock MCP |

Usage-based `Classify()` runs first; catalog rules overlay explicit A/B/C for known tools.

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `COSTGATE_CONFIG` | `~/.costgate/backends.json` | Backend MCP processes |
| `COSTGATE_GATE_MODE` | `filter` | `filter` or `transparent` |
| `COSTGATE_INTENT` | (empty) | Static keywords to expose Tier B tools |
| `COSTGATE_INTENT_DYNAMIC` | `1` | `0`/`false` disables usage-based intent inference |
| `COSTGATE_INTENT_PROBE` | `1` | `0`/`false` disables Probe JSONL keyword inference |
| `COSTGATE_INTENT_PROMPT` | `1` | `0`/`false` disables prompt-intent hook keyword inference |
| `COSTGATE_PROMPT_INTENT_DIR` | `~/.costgate/prompt-intent` | Hook output directory |
| `COSTGATE_PROMPT_INTENT_WINDOW` | `10m` | Max age for `latest.json` keywords |
| `COSTGATE_COMPRESS` | `0` | `1`/`true` enables tool result text truncation |
| `COSTGATE_CODE_MODE` | `0` | `1`/`true` — outline for `.go`/`.ts`/`.py` file reads |
| `COSTGATE_CODE_MODE_ENGINE` | `auto` | `auto`/`ast`/`regex` — outline extractor (Go: go/ast) |
| `COSTGATE_CODE_MODE_MIN_CHARS` | `3000` | Min source size before outline |
| `COSTGATE_CODE_MODE_MAX_CHARS` | `6000` | Max outline output size |
| `COSTGATE_COMPRESS_MAX_CHARS` | `12000` | Max total text chars kept per tool result |
| `COSTGATE_USAGE_PATH` | `~/.costgate/usage.json` | Tool usage store |
| `COSTGATE_PROBE_LOG_DIR` | `~/.costgate/logs` | Probe logs for usage import |

## Cursor

See [examples/cursor/mcp-gate-github.json](../../examples/cursor/mcp-gate-github.json).

- **costgate-gate** — GitHub MCP (filtered via `~/.costgate/backends.json`)

## Tests

```bash
npm run test:gate            # transparent mode (26 tools)
npm run test:gate:filter     # filter mode + discover_tools
npm run test:gate:codemode   # code-mode outline unit tests
npm run compare              # Before/After token estimate report
```

## Before/After comparison

```bash
npm run compare
npm run compare -- --intent "pull request"
npm run compare -- --via-probe    # use Probe as baseline
npm run compare -- --json
```

Measures `tools/list` schema size: **gate transparent** (or Probe) vs **gate filter**.
