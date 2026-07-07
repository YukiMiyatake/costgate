/**
 * Shared eval harness — used by test/eval/run.mjs and optimize-sweep.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withMcpProcess, summarizeTools } from "./mcp-client.mjs";
import { gateBin } from "./paths.mjs";

export function assertStep(step, context) {
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

export function seedTaskFixtures(task, env) {
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
  if (task.seed_trust && env.COSTGATE_TRUST_PATH) {
    writeFileSync(env.COSTGATE_TRUST_PATH, `${JSON.stringify(task.seed_trust, null, 2)}\n`);
  }
}

export async function runEvalTask(task, env, options = {}) {
  const label = options.label ?? `eval-${task.id}`;
  const startupMs = options.startupMs ?? 4000;
  seedTaskFixtures(task, env);
  const started = Date.now();
  const stepResults = [];

  try {
    await withMcpProcess(
      gateBin(),
      [],
      env,
      async (client) => {
        await client.initialize(label);
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
      { label, startupMs }
    );

    return {
      task_id: task.id,
      task_name: task.name,
      passed: true,
      duration_ms: Date.now() - started,
      steps: stepResults,
    };
  } catch (e) {
    return {
      task_id: task.id,
      task_name: task.name,
      passed: false,
      duration_ms: Date.now() - started,
      error: String(e.message ?? e),
      steps: stepResults,
    };
  }
}

export function buildEvalReport(results, meta = {}) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const durations = results.map((r) => r.duration_ms).sort((a, b) => a - b);
  const p50 =
    durations.length === 0
      ? 0
      : durations[Math.floor((durations.length - 1) * 0.5)] ?? durations[0];

  return {
    version: 2,
    generated_at: new Date().toISOString(),
    ...meta,
    summary: {
      total,
      passed,
      failed: total - passed,
      pass_rate_pct: total ? Math.round((passed / total) * 1000) / 10 : 0,
      p50_duration_ms: p50,
    },
    results,
  };
}

export function diffEvalReports(prev, curr) {
  const prevMap = new Map((prev.results ?? []).map((r) => [r.task_id, r]));
  const changes = [];
  for (const r of curr.results ?? []) {
    const old = prevMap.get(r.task_id);
    if (!old) {
      changes.push({ type: "added", task_id: r.task_id, passed: r.passed });
      continue;
    }
    if (old.passed !== r.passed) {
      changes.push({
        type: "status",
        task_id: r.task_id,
        from: old.passed,
        to: r.passed,
      });
    }
    prevMap.delete(r.task_id);
  }
  for (const [task_id, old] of prevMap) {
    changes.push({ type: "removed", task_id, was_passed: old.passed });
  }
  return {
    baseline_at: prev.generated_at,
    current_at: curr.generated_at,
    pass_rate_delta: (curr.summary?.pass_rate_pct ?? 0) - (prev.summary?.pass_rate_pct ?? 0),
    changes,
  };
}
