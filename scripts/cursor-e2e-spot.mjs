#!/usr/bin/env node
/**
 * P8 — Cursor E2E spot validation (MCP proxy layer + manual checklist).
 *
 *   npm run cursor:e2e:spot -- --mock --json
 *   npm run cursor:e2e:spot -- --mock --sweep reports/sweep.json --top 3
 *   npm run cursor:e2e:spot -- --checklist reports/cursor-e2e-checklist.md
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildSpotReport,
  DEFAULT_PROMPTS_PATH,
  loadCursorE2ePrompts,
  loadSweepReport,
  pickSpotConfigsFromSweep,
  renderSpotChecklist,
  runSpotConfig,
} from "./lib/cursor-e2e-spot.mjs";
import { buildConfigSettings } from "./lib/optimize-sweep.mjs";
import { gateBin } from "./lib/paths.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const useMock = args.includes("--mock") || !args.includes("--live");

function readArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? "" : "";
}

const sweepPath = readArg("--sweep");
const outPath = readArg("--out");
const checklistPath = readArg("--checklist");
const topN = Number(readArg("--top") || "3");
const promptsPath = readArg("--prompts") || DEFAULT_PROMPTS_PATH;
const promptLimit = Number(readArg("--limit") || "0");

function printReport(report) {
  console.log("# CostGate Cursor E2E spot (proxy layer)\n");
  console.log(
    `Configs: ${report.configs} · Prompts: ${report.summary.prompts_total} · Pass: ${report.summary.pass_rate_pct}% · discover_needed: ${report.summary.discover_needed_rate_pct}%\n`
  );
  for (const run of report.config_runs) {
    console.log(`## ${run.config_id} — ${run.summary.met}/${run.summary.prompts} pass`);
    for (const r of run.results) {
      const mark = r.met ? "✅" : "❌";
      const disc = r.discover_needed ? " (discover)" : "";
      console.log(`- ${mark} ${r.prompt_id}${disc}`);
    }
    console.log("");
  }
}

async function main() {
  if (!useMock) {
    console.error("[cursor:e2e:spot] only --mock is supported in P8");
    process.exit(1);
  }
  if (!existsSync(gateBin())) {
    console.error("[cursor:e2e:spot] gate binary missing. Run: npm run build:gate");
    process.exit(1);
  }

  let prompts = loadCursorE2ePrompts(promptsPath);
  if (promptLimit > 0) prompts = prompts.slice(0, promptLimit);
  let configSpecs = [{ config_id: "default", settings: buildConfigSettings({ intent_prompt: true }) }];

  if (sweepPath) {
    if (!existsSync(sweepPath)) {
      console.error(`[cursor:e2e:spot] sweep not found: ${sweepPath}`);
      process.exit(1);
    }
    const sweep = loadSweepReport(sweepPath);
    const picked = pickSpotConfigsFromSweep(sweep, topN);
    if (!picked.length) {
      console.error("[cursor:e2e:spot] no configs in sweep report");
      process.exit(1);
    }
    configSpecs = picked;
  }

  const configRuns = [];
  for (const spec of configSpecs) {
    if (!jsonOut) {
      console.error(`[cursor:e2e:spot] ${spec.config_id} (${prompts.length} prompts)...`);
    }
    configRuns.push(await runSpotConfig(spec.settings, prompts, { config_id: spec.config_id }));
  }

  const report = buildSpotReport(configRuns, {
    mode: "mock",
    prompts_file: promptsPath,
    sweep_file: sweepPath || null,
  });

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`[cursor:e2e:spot] wrote ${outPath}`);
  }

  if (checklistPath) {
    mkdirSync(dirname(checklistPath), { recursive: true });
    writeFileSync(checklistPath, `${renderSpotChecklist(report)}\n`);
    console.error(`[cursor:e2e:spot] wrote checklist ${checklistPath}`);
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[cursor:e2e:spot] fatal:", e);
  process.exit(1);
});
