#!/usr/bin/env node
/**
 * Phase 17 — Eval v2 harness extensions.
 *
 *   npm run eval -- --out test/eval/history/run.json
 *   npm run eval -- --diff test/eval/baseline.json
 *   npm run eval:live   # GitHub token required
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withMcpProcess, summarizeTools } from "../../scripts/lib/mcp-client.mjs";
import { gateBin, mockGateEnv, baseGateEnv } from "../../scripts/lib/paths.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEFAULT_TASKS = join(ROOT, "test/eval/tasks.json");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const liveMode = args.includes("--live");
const tasksIdx = args.indexOf("--tasks");
const tasksPath = tasksIdx >= 0 ? args[tasksIdx + 1] : DEFAULT_TASKS;
const modeIdx = args.indexOf("--mode");
const selectedModes =
  modeIdx >= 0
    ? args[modeIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)
    : null;
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
const diffIdx = args.indexOf("--diff");
const diffPath = diffIdx >= 0 ? args[diffIdx + 1] : null;

const spec = JSON.parse(readFileSync(tasksPath, "utf8"));

function gateEnv(clientName, modeSpec) {
  if (liveMode) {
    if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
      throw new Error("eval:live requires GITHUB_TOKEN or GH_TOKEN");
    }
    return baseGateEnv(clientName, {
      ...modeSpec.env,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    });
  }
  return mockGateEnv(clientName, modeSpec.env);
}

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
  const env = gateEnv(`eval-${modeKey}-${task.id}`, modeSpec);
  if (task.seed_probe_log?.length && env.COSTGATE_PROBE_LOG_DIR) {
    mkdirSync(env.COSTGATE_PROBE_LOG_DIR, { recursive: true });
    const now = new Date().toISOString();
    const logPath = join(env.COSTGATE_PROBE_LOG_DIR, `probe-${now.slice(0, 10)}.jsonl`);
    const lines = task.seed_probe_log.map((row) =>
      JSON.stringify({
        type: "tool_call",
        tool: row.tool,
        ts: now,
        session_id: "eval-seed",
        client: "eval",
      })
    );
    writeFileSync(logPath, lines.join("\n") + "\n");
  }
  if (task.seed_prompt_intent && env.COSTGATE_PROMPT_INTENT_DIR) {
    mkdirSync(env.COSTGATE_PROMPT_INTENT_DIR, { recursive: true });
    const record = {
      keywords: task.seed_prompt_intent.keywords ?? "",
      ts: Date.now(),
      conversation_id: "eval-seed",
      generation_id: "eval-gen",
      templates: task.seed_prompt_intent.templates ?? [],
      sources: ["eval"],
    };
    writeFileSync(
      join(env.COSTGATE_PROMPT_INTENT_DIR, "latest.json"),
      `${JSON.stringify(record, null, 2)}\n`
    );
  }
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
      { label: `eval-${modeKey}-${task.id}`, startupMs: liveMode ? 15000 : 4000 }
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
    version: 2,
    generated_at: new Date().toISOString(),
    backend: liveMode ? "github" : "mock",
    tasks_file: tasksPath,
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

function diffReports(prev, curr) {
  const prevMap = new Map((prev.results ?? []).map((r) => [`${r.mode}:${r.task_id}`, r]));
  const changes = [];
  for (const r of curr.results ?? []) {
    const key = `${r.mode}:${r.task_id}`;
    const old = prevMap.get(key);
    if (!old) {
      changes.push({ type: "added", mode: r.mode, task_id: r.task_id, passed: r.passed });
      continue;
    }
    if (old.passed !== r.passed) {
      changes.push({
        type: "status",
        mode: r.mode,
        task_id: r.task_id,
        from: old.passed,
        to: r.passed,
      });
    }
    prevMap.delete(key);
  }
  for (const [key, old] of prevMap) {
    const [mode, task_id] = key.split(":");
    changes.push({ type: "removed", mode, task_id, was_passed: old.passed });
  }
  return {
    baseline_at: prev.generated_at,
    current_at: curr.generated_at,
    pass_rate_delta: (curr.summary?.pass_rate_pct ?? 0) - (prev.summary?.pass_rate_pct ?? 0),
    changes,
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

function printDiff(diff) {
  console.log("# CostGate eval diff\n");
  console.log(`Baseline: ${diff.baseline_at}`);
  console.log(`Current:  ${diff.current_at}`);
  console.log(`Pass rate delta: ${diff.pass_rate_delta >= 0 ? "+" : ""}${diff.pass_rate_delta}%\n`);
  if (diff.changes.length === 0) {
    console.log("No task status changes.\n");
    return;
  }
  for (const c of diff.changes) {
    if (c.type === "status") {
      console.log(`- ${c.mode}/${c.task_id}: ${c.from ? "pass" : "fail"} → ${c.to ? "pass" : "fail"}`);
    } else if (c.type === "added") {
      console.log(`- ${c.mode}/${c.task_id}: added (${c.passed ? "pass" : "fail"})`);
    } else {
      console.log(`- ${c.mode}/${c.task_id}: removed (was ${c.was_passed ? "pass" : "fail"})`);
    }
  }
  console.log("");
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

  if (diffPath) {
    if (!existsSync(diffPath)) {
      console.error(`[eval] diff baseline not found: ${diffPath}`);
      process.exit(1);
    }
    const prev = JSON.parse(readFileSync(diffPath, "utf8"));
    const diff = diffReports(prev, report);
    if (jsonOut) {
      console.log(JSON.stringify({ report, diff }, null, 2));
    } else {
      printReport(report);
      printDiff(diff);
    }
  } else if (jsonOut) {
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
