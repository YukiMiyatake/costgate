#!/usr/bin/env node
/**
 * Phase 13 — Accuracy eval harness (mock MCP, no GitHub token).
 *
 *   npm run eval
 *   npm run eval -- --json
 *   npm run eval -- --mode filter,filter_full
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withMcpProcess, summarizeTools } from "../../scripts/lib/mcp-client.mjs";
import { gateBin, mockGateEnv } from "../../scripts/lib/paths.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TASKS_PATH = join(ROOT, "test/eval/tasks.json");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const modeIdx = args.indexOf("--mode");
const selectedModes =
  modeIdx >= 0
    ? args[modeIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)
    : null;
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

const spec = JSON.parse(readFileSync(TASKS_PATH, "utf8"));

function assertStep(step, context) {
  const errors = [];

  if (step.action === "list_tools") {
    const count = context.tools.length;
    const names = context.tools.map((t) => t.name);
    const a = step.assert ?? {};
    if (a.min_count != null && count < a.min_count) {
      errors.push(`tool count ${count} < min ${a.min_count}`);
    }
    if (a.max_count != null && count > a.max_count) {
      errors.push(`tool count ${count} > max ${a.max_count}`);
    }
    for (const name of a.includes ?? []) {
      if (!names.includes(name)) {
        errors.push(`missing tool ${name}`);
      }
    }
    context.lastText = JSON.stringify(names);
    context.tokenEstimate = summarizeTools(context.tools).estimated_tokens;
  }

  if (step.action === "call") {
    const result = context.lastResult;
    const text =
      result?.content?.find((c) => c.type === "text")?.text ??
      result?.content?.[0]?.text ??
      "";
    context.lastText = text;
    if (step.assert_text_contains && !text.includes(step.assert_text_contains)) {
      errors.push(`text missing "${step.assert_text_contains}"`);
    }
    if (step.assert_text_excludes && text.includes(step.assert_text_excludes)) {
      errors.push(`text should not contain "${step.assert_text_excludes}"`);
    }
    for (const sym of step.assert_symbols ?? []) {
      if (!text.includes(sym)) {
        errors.push(`outline missing symbol "${sym}"`);
      }
    }
  }

  return errors;
}

async function runTask(modeKey, modeSpec, task) {
  const env = mockGateEnv(`eval-${modeKey}-${task.id}`, modeSpec.env);
  const started = Date.now();
  const stepResults = [];

  try {
    await withMcpProcess(
      gateBin(),
      [],
      env,
      async (client) => {
        await client.initialize(`eval-${task.id}`);
        const context = { tools: [], lastResult: null, lastText: "", tokenEstimate: 0 };

        for (const step of task.steps) {
          if (step.action === "list_tools") {
            context.tools = await client.listTools();
          } else if (step.action === "call") {
            context.lastResult = await client.callTool(step.tool, step.args ?? {});
          } else {
            throw new Error(`unknown step action: ${step.action}`);
          }
          const errors = assertStep(step, context);
          stepResults.push({
            action: step.action,
            tool: step.tool ?? null,
            passed: errors.length === 0,
            errors,
            token_estimate: context.tokenEstimate || undefined,
          });
          if (errors.length > 0) {
            throw new Error(errors.join("; "));
          }
        }
      },
      { label: `eval-${modeKey}-${task.id}`, startupMs: 4000 }
    );

    return {
      mode: modeKey,
      task_id: task.id,
      task_name: task.name,
      passed: true,
      duration_ms: Date.now() - started,
      steps: stepResults,
    };
  } catch (e) {
    return {
      mode: modeKey,
      task_id: task.id,
      task_name: task.name,
      passed: false,
      duration_ms: Date.now() - started,
      error: String(e.message ?? e),
      steps: stepResults,
    };
  }
}

function buildReport(results) {
  const byMode = {};
  for (const r of results) {
    if (!byMode[r.mode]) {
      byMode[r.mode] = { passed: 0, failed: 0, total: 0, tasks: [] };
    }
    byMode[r.mode].total++;
    if (r.passed) byMode[r.mode].passed++;
    else byMode[r.mode].failed++;
    byMode[r.mode].tasks.push(r);
  }
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  return {
    generated_at: new Date().toISOString(),
    backend: "mock",
    summary: {
      total,
      passed,
      failed: total - passed,
      pass_rate_pct: total ? Math.round((passed / total) * 1000) / 10 : 0,
    },
    modes: byMode,
    results,
  };
}

function printReport(report) {
  console.log("# CostGate accuracy eval\n");
  console.log(
    `Summary: ${report.summary.passed}/${report.summary.total} passed (${report.summary.pass_rate_pct}%)\n`
  );
  for (const [mode, stats] of Object.entries(report.modes)) {
    const label = spec.modes[mode]?.label ?? mode;
    console.log(`## ${label}`);
    console.log(`Pass: ${stats.passed}/${stats.total}\n`);
    for (const t of stats.tasks) {
      const mark = t.passed ? "✅" : "❌";
      console.log(`- ${mark} ${t.task_name}${t.error ? ` — ${t.error}` : ""}`);
    }
    console.log("");
  }
}

async function main() {
  const modeKeys = selectedModes ?? Object.keys(spec.modes);
  const results = [];

  for (const modeKey of modeKeys) {
    const modeSpec = spec.modes[modeKey];
    if (!modeSpec) {
      console.error(`[eval] unknown mode: ${modeKey}`);
      process.exit(1);
    }
    for (const task of spec.tasks) {
      if (!task.modes.includes(modeKey)) continue;
      if (!jsonOut) {
        console.error(`[eval] ${modeKey} / ${task.id}...`);
      }
      results.push(await runTask(modeKey, modeSpec, task));
    }
  }

  const report = buildReport(results);

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(`[eval] wrote ${outPath}`);
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
  console.error("[eval] fatal:", e);
  process.exit(1);
});
