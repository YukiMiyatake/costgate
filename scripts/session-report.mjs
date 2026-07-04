#!/usr/bin/env node
/**
 * Phase 7: Session token breakdown — fixed (tools/list) + variable (tool_call)
 * plus Gate before/after and hypothetical overall reduction %.
 *
 * Usage:
 *   npm run session-report
 *   npm run session-report -- --json
 *   npm run session-report -- --skip-compare   # logs only, no live Gate measure
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseProbeLogs,
  mcpMeasurableTokens,
  fixedSharePct,
  scenarioOverallReduction,
} from "./lib/parse-probe-logs.mjs";
import {
  withMcpProcess,
  summarizeTools,
  pctReduction,
} from "./lib/mcp-client.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GATE_BIN =
  process.env.COSTGATE_GATE_BIN ?? join(ROOT, "packages/gate/bin/costgate-gate");
const CONFIG =
  process.env.COSTGATE_CONFIG ??
  join(process.env.HOME ?? "", ".costgate/backends.json");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const skipCompare = args.includes("--skip-compare");
const intentIdx = args.indexOf("--intent");
const intent =
  intentIdx >= 0 ? args[intentIdx + 1] ?? "" : process.env.COSTGATE_INTENT ?? "";

const baseEnv = {
  COSTGATE_CONFIG: CONFIG,
  COSTGATE_CLIENT: "session-report",
};

async function measureGate(mode) {
  return withMcpProcess(
    GATE_BIN,
    [],
    {
      ...baseEnv,
      COSTGATE_GATE_MODE: mode,
      ...(mode === "filter" ? { COSTGATE_INTENT: intent } : {}),
    },
    async (client) => {
      await client.initialize(`session-${mode}`);
      return summarizeTools(await client.listTools());
    },
    { label: `gate-${mode}`, startupMs: 5000 }
  );
}

async function loadGateCompare() {
  if (skipCompare || !existsSync(GATE_BIN)) return null;
  if (!jsonOut) console.error("[session-report] measuring Gate before/after...");
  const before = await measureGate("transparent");
  const after = await measureGate("filter");
  const perTurnSavings = before.estimated_tokens - after.estimated_tokens;
  return {
    before,
    after,
    per_turn_savings: perTurnSavings,
    definition_reduction_pct: pctReduction(
      before.estimated_tokens,
      after.estimated_tokens
    ),
  };
}

function buildReport(logs, gate) {
  const g = logs.global;
  const mcpTotal = mcpMeasurableTokens(g);
  const fixedPct = fixedSharePct(g);

  const avgToolsListPerSession =
    g.sessions > 0 ? Math.round(g.tools_list_tokens / g.sessions) : 0;
  const avgToolCallsPerSession =
    g.sessions > 0 ? Math.round(g.tool_call_tokens / g.sessions) : 0;

  const perTurnSavings = gate?.per_turn_savings ?? 0;
  const toolsListEvents = Math.max(g.tools_list_events, 1);
  const totalFixedSavingsLogged = perTurnSavings * g.tools_list_events;

  const scenarios = [5000, 10000, 20000, 50000, 100000].map((total) => ({
    hypothetical_turn_tokens: total,
    overall_reduction_pct: scenarioOverallReduction(perTurnSavings, total),
  }));

  return {
    period: logs.period,
    log_dir: logs.logDir,
    probe: {
      sessions: g.sessions,
      tools_list: {
        events: g.tools_list_events,
        total_estimated_tokens: g.tools_list_tokens,
        avg_per_session: avgToolsListPerSession,
      },
      tool_calls: {
        count: g.tool_calls,
        total_estimated_tokens: g.tool_call_tokens,
        request_bytes: g.tool_call_request_bytes,
        response_bytes: g.tool_call_response_bytes,
        avg_per_session: avgToolCallsPerSession,
      },
      mcp_measurable_total_tokens: mcpTotal,
      fixed_share_pct: fixedPct,
    },
    gate: gate
      ? {
          before_tools_list_tokens: gate.before.estimated_tokens,
          after_tools_list_tokens: gate.after.estimated_tokens,
          per_turn_definition_savings: perTurnSavings,
          definition_reduction_pct: gate.definition_reduction_pct,
          intent: intent || null,
          estimated_total_savings_in_logs: totalFixedSavingsLogged,
        }
      : null,
    scenarios,
    top_sessions: logs.sessions.slice(0, 5),
    notes: [
      "MCP-measurable = tools/list (fixed) + tool_call I/O (variable) from Probe logs only.",
      "Overall % scenarios assume Gate savings apply once per turn (tools/list layer).",
      "Conversation, system prompt, Serena, and other MCPs are not included.",
    ],
  };
}

function printText(report) {
  console.log("\nCostGate Session Token Breakdown\n");
  if (report.period) {
    console.log(`Period: ${report.period.from} → ${report.period.to}`);
  }
  console.log(`Logs:   ${report.log_dir}\n`);

  const p = report.probe;
  console.log("## MCP-measurable (Probe logs)\n");
  console.log(`Sessions:              ${p.sessions}`);
  console.log(`tools/list events:     ${p.tools_list.events}`);
  console.log(`tools/list tokens:     ~${p.tools_list.total_estimated_tokens.toLocaleString()} (fixed)`);
  console.log(`tool_call count:       ${p.tool_calls.count}`);
  console.log(`tool_call tokens:      ~${p.tool_calls.total_estimated_tokens.toLocaleString()} (variable)`);
  console.log(`MCP-measurable total:  ~${p.mcp_measurable_total_tokens.toLocaleString()}`);
  console.log(`Fixed share:           ${p.fixed_share_pct}% of MCP-measurable\n`);

  if (report.gate) {
    const g = report.gate;
    console.log("## Gate definition layer (live measure)\n");
    console.log(`Before (transparent):  ~${g.before_tools_list_tokens.toLocaleString()} tokens/turn`);
    console.log(`After (filter):        ~${g.after_tools_list_tokens.toLocaleString()} tokens/turn`);
    console.log(`Savings per turn:      ~${g.per_turn_definition_savings.toLocaleString()} (${g.definition_reduction_pct}%)`);
    console.log(
      `Est. savings in logs:  ~${g.estimated_total_savings_in_logs.toLocaleString()} (${p.tools_list.events} tools/list events)\n`
    );
  }

  console.log("## Hypothetical overall reduction (if 1 turn = X total tokens)\n");
  for (const s of report.scenarios) {
    console.log(
      `  ${s.hypothetical_turn_tokens.toLocaleString().padStart(6)} tokens/turn → ~${s.overall_reduction_pct}%`
    );
  }
  console.log();

  if (report.top_sessions.length > 0) {
    console.log("## Top sessions (MCP-measurable)\n");
    for (const s of report.top_sessions) {
      const tot = s.tools_list_tokens + s.tool_call_tokens;
      console.log(
        `  ${s.session_id.slice(0, 8)}… ${s.client} — fixed ~${s.tools_list_tokens}, variable ~${s.tool_call_tokens}, total ~${tot}`
      );
    }
    console.log();
  }

  console.log("Note:", report.notes[2]);
  console.log();
}

async function main() {
  const logs = parseProbeLogs();
  const gate = await loadGateCompare();
  const report = buildReport(logs, gate);

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (logs.global.sessions === 0) {
    console.error("[session-report] no Probe sessions found.");
    console.error("Run with costgate-probe or: npm run cursor:measurement");
  }

  printText(report);
}

main().catch((e) => {
  console.error("[session-report] fatal:", e);
  process.exit(1);
});
