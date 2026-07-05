#!/usr/bin/env node
/**
 * Before/After report: full tools/list (Probe or Gate transparent) vs Gate filter.
 *
 * Usage:
 *   npm run compare
 *   npm run compare -- --intent "pull request"
 *   npm run compare -- --json
 *   npm run compare -- --via-probe
 *   npm run compare -- --mock
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withMcpProcess, summarizeTools, pctReduction } from "./lib/mcp-client.mjs";
import { baseGateEnv, gateBin, probeJs, mockGateEnv } from "./lib/paths.mjs";

const GATE_BIN = gateBin();
const PROBE_JS = probeJs();

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const viaProbe = args.includes("--via-probe");
const useMock = args.includes("--mock");
const intentIdx = args.indexOf("--intent");
const intent =
  intentIdx >= 0 ? args[intentIdx + 1] ?? "" : process.env.COSTGATE_INTENT ?? "";

const baseEnv = useMock
  ? mockGateEnv("compare-report")
  : baseGateEnv("compare-report");

async function measureGateTransparent() {
  return withMcpProcess(
    GATE_BIN,
    [],
    { ...baseEnv, COSTGATE_GATE_MODE: "transparent" },
    async (client) => {
      await client.initialize("compare-before");
      const tools = await client.listTools();
      return summarizeTools(tools);
    },
    { label: "gate-transparent", startupMs: 5000 }
  );
}

async function measureProbe() {
  return withMcpProcess(
    "node",
    [PROBE_JS],
    {
      ...baseEnv,
      COSTGATE_PROBE_LOG_DIR:
        process.env.COSTGATE_PROBE_LOG_DIR ??
        join(process.env.HOME ?? "", ".costgate/logs"),
    },
    async (client) => {
      await client.initialize("compare-probe");
      const tools = await client.listTools();
      return summarizeTools(tools);
    },
    { label: "probe", startupMs: 3000 }
  );
}

async function measureGateFilter() {
  return withMcpProcess(
    GATE_BIN,
    [],
    {
      ...baseEnv,
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT: intent,
      COSTGATE_INTENT_DYNAMIC: args.includes("--dynamic") ? "1" : "0",
    },
    async (client) => {
      await client.initialize("compare-after");
      const tools = await client.listTools();
      return summarizeTools(tools);
    },
    { label: "gate-filter", startupMs: 5000 }
  );
}

function loadLatestProbeToolsList() {
  const logDir =
    process.env.COSTGATE_PROBE_LOG_DIR ??
    join(process.env.HOME ?? "", ".costgate/logs");
  if (!existsSync(logDir)) return null;

  const files = readdirSync(logDir)
    .filter((f) => f.startsWith("probe-") && f.endsWith(".jsonl"))
    .sort()
    .reverse();

  for (const file of files) {
    const lines = readFileSync(join(logDir, file), "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const row = JSON.parse(lines[i]);
        if (row.type === "tools_list" && row.tool_count != null) {
          return {
            source: `probe-log:${file}`,
            tool_count: row.tool_count,
            total_schema_bytes: row.total_schema_bytes,
            estimated_tokens: row.estimated_tokens,
          };
        }
      } catch {
        // skip
      }
    }
  }
  return null;
}

function printReport(before, after, beforeLabel) {
  const report = {
    before: { label: beforeLabel, ...before },
    after: { label: "gate-filter", intent: intent || null, ...after },
    reduction: {
      tools_pct: pctReduction(before.tool_count, after.tool_count),
      bytes_pct: pctReduction(before.total_schema_bytes, after.total_schema_bytes),
      tokens_pct: pctReduction(before.estimated_tokens, after.estimated_tokens),
    },
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nCostGate Before/After — tools/list token estimate\n");
  if (useMock) {
    console.log("Backend: mock MCP (catalog tier rules applied)\n");
  }
  console.log(`Before (${beforeLabel})`);
  console.log(`  tools:          ${before.tool_count}`);
  console.log(`  schema bytes:   ${before.total_schema_bytes.toLocaleString()}`);
  console.log(`  est. tokens:    ~${before.estimated_tokens.toLocaleString()}`);
  console.log();
  console.log(`After (gate filter${intent ? `, intent="${intent}"` : ""})`);
  console.log(`  tools:          ${after.tool_count}`);
  console.log(`  schema bytes:   ${after.total_schema_bytes.toLocaleString()}`);
  console.log(`  est. tokens:    ~${after.estimated_tokens.toLocaleString()}`);
  console.log();
  console.log("Reduction");
  console.log(`  tools:          ${report.reduction.tools_pct}%`);
  console.log(`  schema bytes:   ${report.reduction.bytes_pct}%`);
  console.log(`  est. tokens:    ${report.reduction.tokens_pct}%`);
  console.log();
}

async function main() {
  if (!existsSync(GATE_BIN)) {
    console.error(`[compare] gate binary not found: ${GATE_BIN}`);
    console.error("Run: npm run build:gate");
    process.exit(1);
  }
  if (viaProbe && !existsSync(PROBE_JS)) {
    console.error(`[compare] probe not built: ${PROBE_JS}`);
    console.error("Run: npm run build:probe");
    process.exit(1);
  }

  const logBaseline = loadLatestProbeToolsList();
  if (logBaseline && !jsonOut) {
    console.error(
      `[compare] note: latest probe log tools_list — ${logBaseline.tool_count} tools, ~${logBaseline.estimated_tokens} tokens (${logBaseline.source})`
    );
  }

  if (!jsonOut) {
    console.error(`[compare] measuring before (${viaProbe ? "probe" : "gate transparent"})...`);
  }
  const before = viaProbe ? await measureProbe() : await measureGateTransparent();

  if (!jsonOut) {
    console.error("[compare] measuring after (gate filter)...");
  }
  const after = await measureGateFilter();

  printReport(before, after, viaProbe ? "probe" : "gate-transparent");
}

main().catch((e) => {
  console.error("[compare] fatal:", e);
  process.exit(1);
});
