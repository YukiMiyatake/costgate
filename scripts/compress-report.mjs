#!/usr/bin/env node
/**
 * CostGate full reduction report: definitions (filter) + tool results (compress).
 *
 * Usage:
 *   npm run compress-report
 *   npm run compress-report -- --json
 *   npm run compress-report -- --code-mode
 */
import { existsSync } from "node:fs";
import {
  withMcpProcess,
  summarizeTools,
  summarizeCallResult,
  pctReduction,
} from "./lib/mcp-client.mjs";
import { parseProbeLogs, bytesToTokens } from "./lib/parse-probe-logs.mjs";
import { baseGateEnv, gateBin, mockGateEnv } from "./lib/paths.mjs";

const GATE_BIN = gateBin();

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const skipToolCall = args.includes("--skip-tool-call");
const codeModeReport = args.includes("--code-mode");
const useMock = args.includes("--mock");
const toolIdx = args.indexOf("--tool");
const backendTool = toolIdx >= 0 ? args[toolIdx + 1] : "get_file_contents";

const DEFAULT_INVOKE = useMock
  ? {
      get_file_contents: { owner: "o", repo: "r", path: "package-lock.json" },
    }
  : {
      get_file_contents: {
        owner: "YukiMiyatake",
        repo: "costgate",
        path: "package-lock.json",
      },
    };

const CODE_MODE_INVOKE = {
  get_file_contents: {
    owner: "YukiMiyatake",
    repo: "costgate",
    path: "packages/gate/cmd/costgate-gate/main.go",
  },
};

const baseEnv = useMock
  ? mockGateEnv("compress-report", {
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT: "pull request",
      COSTGATE_INTENT_DYNAMIC: "0",
    })
  : baseGateEnv("compress-report", {
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT_DYNAMIC: "0",
    });

async function measureDefinitions() {
  const before = await withMcpProcess(
    GATE_BIN,
    [],
    { ...baseEnv, COSTGATE_GATE_MODE: "transparent" },
    async (client) => {
      await client.initialize("compress-def-before");
      return summarizeTools(await client.listTools());
    },
    { startupMs: 5000 }
  );

  const after = await withMcpProcess(
    GATE_BIN,
    [],
    { ...baseEnv, COSTGATE_GATE_MODE: "filter", COSTGATE_COMPRESS: "0" },
    async (client) => {
      await client.initialize("compress-def-after");
      return summarizeTools(await client.listTools());
    },
    { startupMs: 5000 }
  );

  return {
    before,
    after,
    savings_per_turn: before.estimated_tokens - after.estimated_tokens,
    reduction_pct: pctReduction(before.estimated_tokens, after.estimated_tokens),
  };
}

async function measureToolCall(compress, { codeMode = false, invoke = DEFAULT_INVOKE } = {}) {
  const invokeArgs = invoke[backendTool] ?? {};
  return withMcpProcess(
    GATE_BIN,
    [],
    {
      ...baseEnv,
      COSTGATE_COMPRESS: compress ? "1" : "0",
      COSTGATE_CODE_MODE: codeMode ? "1" : "0",
      COSTGATE_COMPRESS_MAX_CHARS:
        process.env.COSTGATE_COMPRESS_MAX_CHARS ?? "12000",
    },
    async (client) => {
      await client.initialize(`compress-tool-${compress ? "on" : "off"}`);
      const result = await client.callTool("invoke_tool", {
        name: backendTool,
        arguments: invokeArgs,
      });
      return summarizeCallResult(result);
    },
    { startupMs: 5000, timeoutMs: 180000 }
  );
}

function probeVariableEstimate(logs) {
  const g = logs.global;
  if (g.tool_calls === 0) return null;
  const maxChars = Number(process.env.COSTGATE_COMPRESS_MAX_CHARS ?? 12000);
  let compressibleBytes = 0;
  // Rough: responses over maxChars text budget (~4 bytes/char for JSON overhead)
  const threshold = maxChars * 4;
  if (g.tool_call_response_bytes > threshold) {
    compressibleBytes = g.tool_call_response_bytes - maxChars * 4;
  }
  return {
    tool_calls: g.tool_calls,
    total_response_bytes: g.tool_call_response_bytes,
    total_variable_tokens: g.tool_call_tokens,
    estimated_compressible_tokens: bytesToTokens(compressibleBytes),
  };
}

function printReport(report) {
  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nCostGate Token Reduction Report\n");
  if (report.backend === "mock") {
    console.log("Backend: mock MCP (CI-safe, no GitHub token)\n");
  }

  const d = report.definitions;
  console.log("## Layer 1 — Tool definitions (tools/list)\n");
  console.log(`Before (transparent):  ~${d.before.estimated_tokens.toLocaleString()} tokens (${d.before.tool_count} tools)`);
  console.log(`After (filter):        ~${d.after.estimated_tokens.toLocaleString()} tokens (${d.after.tool_count} tools)`);
  console.log(`Savings per turn:      ~${d.savings_per_turn.toLocaleString()} (${d.reduction_pct}%)\n`);

  if (report.tool_result) {
    const t = report.tool_result;
    console.log(`## Layer 2 — Tool results (${t.tool})\n`);
    console.log(`Without compress:      ~${t.without_compress.estimated_tokens.toLocaleString()} tokens (${t.without_compress.text_chars.toLocaleString()} text chars)`);
    console.log(`With compress:         ~${t.with_compress.estimated_tokens.toLocaleString()} tokens (${t.with_compress.text_chars.toLocaleString()} text chars)`);
    console.log(`Savings per call:      ~${t.savings_per_call.toLocaleString()} (${t.reduction_pct}%)\n`);
  }

  if (report.code_mode) {
    const c = report.code_mode;
    console.log(`## Layer 2b — Code mode (${c.path})\n`);
    console.log(`Raw:                   ~${c.raw.estimated_tokens.toLocaleString()} tokens`);
    console.log(`Code mode only:        ~${c.codemode.estimated_tokens.toLocaleString()} tokens (${c.codemode_reduction_pct}%)`);
    console.log(`Code mode + compress:  ~${c.both.estimated_tokens.toLocaleString()} tokens (${c.both_reduction_pct}%)\n`);
  }

  if (report.combined) {
    const c = report.combined;
    console.log("## Combined (1 turn = definitions + 1 tool call)\n");
    console.log(`Before:                ~${c.before_total.toLocaleString()} tokens`);
    console.log(`After filter+compress: ~${c.after_total.toLocaleString()} tokens`);
    console.log(`Overall reduction:     ~${c.overall_reduction_pct}%\n`);
  }

  if (report.probe_logs) {
    const p = report.probe_logs;
    console.log("## Probe logs (historical variable layer)\n");
    console.log(`tool_call count:       ${p.tool_calls}`);
    console.log(`variable tokens:       ~${p.total_variable_tokens.toLocaleString()}`);
    if (p.estimated_compressible_tokens > 0) {
      console.log(
        `est. compressible:     ~${p.estimated_compressible_tokens.toLocaleString()} (large responses only)`
      );
    }
    console.log();
  }

  console.log("Note:", report.notes.join(" "));
  console.log();
}

async function main() {
  if (!existsSync(GATE_BIN)) {
    console.error("[compress-report] gate binary missing. Run: npm run build:gate");
    process.exit(1);
  }

  if (!jsonOut) console.error("[compress-report] measuring definition layer...");
  const definitions = await measureDefinitions();

  let toolResult = null;
  if (!skipToolCall) {
    if (!jsonOut) {
      console.error(`[compress-report] measuring tool call (${backendTool}) without compress...`);
    }
    const without = await measureToolCall(false);
    if (!jsonOut) {
      console.error(`[compress-report] measuring tool call (${backendTool}) with compress...`);
    }
    const withCompress = await measureToolCall(true);
    toolResult = {
      tool: backendTool,
      without_compress: without,
      with_compress: withCompress,
      savings_per_call:
        without.estimated_tokens - withCompress.estimated_tokens,
      reduction_pct: pctReduction(
        without.estimated_tokens,
        withCompress.estimated_tokens
      ),
    };
  }

  let codeMode = null;
  if (codeModeReport && !skipToolCall) {
    const invoke = CODE_MODE_INVOKE;
    const path = invoke[backendTool]?.path ?? backendTool;
    if (!jsonOut) {
      console.error(`[compress-report] code-mode layer (${path})...`);
    }
    const raw = await measureToolCall(false, { codeMode: false, invoke });
    const codemode = await measureToolCall(false, { codeMode: true, invoke });
    const both = await measureToolCall(true, { codeMode: true, invoke });
    codeMode = {
      path,
      raw,
      codemode,
      both,
      codemode_reduction_pct: pctReduction(raw.estimated_tokens, codemode.estimated_tokens),
      both_reduction_pct: pctReduction(raw.estimated_tokens, both.estimated_tokens),
    };
  }

  let combined = null;
  if (toolResult) {
    const beforeTotal =
      definitions.before.estimated_tokens +
      toolResult.without_compress.estimated_tokens;
    const afterTotal =
      definitions.after.estimated_tokens +
      toolResult.with_compress.estimated_tokens;
    combined = {
      before_total: beforeTotal,
      after_total: afterTotal,
      overall_reduction_pct: pctReduction(beforeTotal, afterTotal),
    };
  }

  const logs = parseProbeLogs();
  const probeLogs = probeVariableEstimate(logs);

  const report = {
    backend: useMock ? "mock" : "github",
    definitions,
    tool_result: toolResult,
    code_mode: codeMode,
    combined,
    probe_logs: probeLogs,
    notes: [
      "Definition layer = Gate filter on tools/list.",
      "Result layer = live invoke_tool with COSTGATE_COMPRESS on/off.",
      "Code mode layer (--code-mode) = outline for .go source file.",
      "Conversation and MCPs outside Probe/Gate are excluded.",
    ],
  };

  printReport(report);
}

main().catch((e) => {
  console.error("[compress-report] fatal:", e);
  process.exit(1);
});
