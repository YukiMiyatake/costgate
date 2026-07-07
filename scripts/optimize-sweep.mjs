#!/usr/bin/env node
/**
 * P6a — Parameter grid sweep: tokens × eval pass rate.
 *
 *   npm run optimize:sweep -- --mock \
 *     --grid exposure_mode=conservative,aggressive,budget \
 *     --grid intent_source=env,probe \
 *     --tasks test/eval/sweep-tasks.json \
 *     --out reports/sweep.json
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildConfigSettings,
  buildSweepReport,
  cartesianGrid,
  configId,
  loadSweepTasks,
  measureFilterConfig,
  measureTransparentBaseline,
  parseGridArgs,
  runEvalForConfig,
} from "./lib/optimize-sweep.mjs";
import { gateBin } from "./lib/paths.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_TASKS = join(ROOT, "test/eval/sweep-tasks.json");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const useMock = args.includes("--mock") || !args.includes("--live");
const skipEval = args.includes("--skip-eval");
const skipTokens = args.includes("--skip-tokens");

function readArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? "" : "";
}

const tasksPath = readArg("--tasks") || DEFAULT_TASKS;
const outPath = readArg("--out");
const replayPaths = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--replay") {
    const p = args[i + 1];
    if (p) replayPaths.push(p);
  }
}

const grids = parseGridArgs(args);
const configs = cartesianGrid(grids).map((partial) => buildConfigSettings(partial));

function printReport(report) {
  console.log("# CostGate optimize sweep\n");
  console.log(`Configs: ${report.summary.configs} · Pareto: ${report.summary.pareto_count}\n`);
  console.log(
    `Baseline: ${report.baseline.tool_count} tools · ~${report.baseline.estimated_tokens} tokens\n`
  );
  console.log("| config | tokens | reduction | pass | p50 ms | pareto |");
  console.log("|--------|--------|-----------|------|--------|--------|");
  for (const row of report.results) {
    const mark = row.pareto ? "★" : "";
    console.log(
      `| ${row.config_id} | ${row.tools_list_tokens} | ${row.token_reduction_pct}% | ${row.eval_pass_rate}% | ${row.p50_duration_ms} | ${mark} |`
    );
  }
  console.log("");
}

async function main() {
  if (!useMock) {
    console.error("[optimize:sweep] only --mock is supported in P6a");
    process.exit(1);
  }
  if (!existsSync(gateBin())) {
    console.error("[optimize:sweep] gate binary missing. Run: npm run build:gate");
    process.exit(1);
  }

  const tasks = skipEval ? [] : loadSweepTasks(tasksPath, replayPaths);
  if (!skipEval && !tasks.length) {
    console.error("[optimize:sweep] no eval tasks");
    process.exit(1);
  }

  let baseline = { tool_count: 0, estimated_tokens: 0, total_schema_bytes: 0 };
  if (!skipTokens) {
    if (!jsonOut) console.error("[optimize:sweep] measuring transparent baseline...");
    baseline = await measureTransparentBaseline();
  }

  const rows = [];
  for (const settings of configs) {
    const id = configId(settings);
    if (!jsonOut) console.error(`[optimize:sweep] ${id}...`);

    let tokenRow = {
      tool_count: 0,
      tools_list_tokens: 0,
      total_schema_bytes: 0,
      measure_duration_ms: 0,
    };
    if (!skipTokens) {
      const measured = await measureFilterConfig(settings);
      tokenRow = {
        tool_count: measured.tool_count,
        tools_list_tokens: measured.estimated_tokens,
        total_schema_bytes: measured.total_schema_bytes,
        measure_duration_ms: measured.duration_ms,
      };
    }

    let evalSummary = {
      eval_passed: 0,
      eval_total: 0,
      eval_pass_rate: 100,
      p50_duration_ms: 0,
    };
    if (!skipEval) {
      const evalReport = await runEvalForConfig(settings, tasks);
      evalSummary = {
        eval_passed: evalReport.summary.passed,
        eval_total: evalReport.summary.total,
        eval_pass_rate: evalReport.summary.pass_rate_pct,
        p50_duration_ms: evalReport.summary.p50_duration_ms,
        eval: evalReport,
      };
    }

    rows.push({
      config_id: id,
      settings,
      ...tokenRow,
      ...evalSummary,
    });
  }

  const report = buildSweepReport({
    grids,
    baseline,
    rows,
    tasksFile: tasksPath,
    replayFixtures: replayPaths,
  });

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`[optimize:sweep] wrote ${outPath}`);
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

main().catch((e) => {
  console.error("[optimize:sweep] fatal:", e);
  process.exit(1);
});
