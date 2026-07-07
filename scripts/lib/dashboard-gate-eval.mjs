/**
 * Dashboard — evaluate Gate settings with mock sweep tasks (P7c).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pctReduction } from "./mcp-client.mjs";
import { gateBin } from "./paths.mjs";
import { normalizeSettings } from "./gate-settings.mjs";
import {
  buildConfigSettings,
  loadSweepTasks,
  measureFilterConfig,
  measureTransparentBaseline,
  runEvalForConfig,
} from "./optimize-sweep.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEFAULT_TASKS = join(ROOT, "test/eval/sweep-tasks.json");

export function gateEvalTasksPath() {
  return process.env.COSTGATE_GATE_EVAL_TASKS ?? DEFAULT_TASKS;
}

/**
 * Run token + eval check for proposed Gate settings (does not persist).
 */
export async function evaluateGateSettings(partial = {}, options = {}) {
  if (!existsSync(gateBin())) {
    throw new Error("gate binary not found — run npm run build:gate");
  }

  const settings = buildConfigSettings(normalizeSettings(partial));
  const tasksPath = options.tasksPath ?? gateEvalTasksPath();
  const tasks = loadSweepTasks(tasksPath, []);

  const baseline = await measureTransparentBaseline({
    clientName: "dash-gate-eval-baseline",
    startupMs: options.startupMs ?? 5000,
  });
  const measured = await measureFilterConfig(settings, {
    startupMs: options.startupMs ?? 5000,
  });

  let evalReport = null;
  if (tasks.length) {
    evalReport = await runEvalForConfig(settings, tasks, {
      startupMs: options.startupMs ?? 4000,
    });
  }

  const reduction_pct = pctReduction(baseline.estimated_tokens, measured.estimated_tokens);

  return {
    ok: evalReport ? evalReport.summary.failed === 0 : true,
    settings,
    tokens: {
      baseline: baseline.estimated_tokens,
      baseline_tools: baseline.tool_count,
      filter: measured.estimated_tokens,
      filter_tools: measured.tool_count,
      reduction_pct,
    },
    eval: evalReport
      ? {
          passed: evalReport.summary.passed,
          total: evalReport.summary.total,
          pass_rate_pct: evalReport.summary.pass_rate_pct,
          p50_duration_ms: evalReport.summary.p50_duration_ms,
        }
      : null,
    tasks_file: tasksPath,
    generated_at: new Date().toISOString(),
  };
}
