/**
 * Parameter grid sweep — token measurement + eval pass rate (P6a/P6b).
 */
import { existsSync, readFileSync } from "node:fs";
import { withMcpProcess, summarizeTools, pctReduction } from "./mcp-client.mjs";
import { gateBin, mockGateEnv } from "./paths.mjs";
import {
  DEFAULT_GATE_SETTINGS,
  gateSettingsToEnv,
  normalizeSettings,
} from "./gate-settings.mjs";
import { buildEvalReport, runEvalTask } from "./eval-harness.mjs";
import { loadReplayFixture, replayFixtureToEvalTask } from "./session-replay.mjs";

export const INTENT_SOURCE_PRESETS = {
  env: {
    intent_dynamic: false,
    intent_probe: false,
    intent_prompt: false,
    static_intent: "pull request",
  },
  probe: {
    intent_dynamic: true,
    intent_probe: true,
    intent_prompt: false,
    static_intent: "",
  },
  prompt: {
    intent_dynamic: true,
    intent_probe: false,
    intent_prompt: true,
    static_intent: "",
  },
  merge: {
    intent_dynamic: true,
    intent_probe: true,
    intent_prompt: true,
    static_intent: "",
  },
};

const GRID_ALIASES = {
  intent_source: INTENT_SOURCE_PRESETS,
};

/** @param {string[]} argv */
export function parseGridArgs(argv) {
  const grids = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--grid") continue;
    const spec = argv[i + 1];
    if (!spec || !spec.includes("=")) {
      throw new Error(`invalid --grid: ${spec ?? "(missing)"}`);
    }
    const eq = spec.indexOf("=");
    const key = spec.slice(0, eq).trim();
    const values = spec
      .slice(eq + 1)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!key || !values.length) {
      throw new Error(`invalid --grid: ${spec}`);
    }
    grids[key] = values;
  }
  return grids;
}

export function parseGridValue(key, raw) {
  if (key === "intent_source") return raw;
  if (["compress", "code_mode", "intent_dynamic", "intent_probe", "intent_prompt", "slim_list"].includes(key)) {
    return raw === "true" || raw === "1";
  }
  if (["exposure_max_b", "exposure_token_budget", "compress_max_chars", "slim_list_max_chars"].includes(key)) {
    return Number(raw);
  }
  return raw;
}

export function cartesianGrid(grids) {
  const keys = Object.keys(grids);
  if (!keys.length) {
    return [{}];
  }

  function expand(i, partial) {
    if (i >= keys.length) return [partial];
    const key = keys[i];
    const out = [];
    for (const raw of grids[key]) {
      const value = parseGridValue(key, raw);
      if (key === "intent_source" && GRID_ALIASES.intent_source[value]) {
        out.push(...expand(i + 1, { ...partial, ...GRID_ALIASES.intent_source[value] }));
      } else {
        out.push(...expand(i + 1, { ...partial, [key]: value }));
      }
    }
    return out;
  }

  return expand(0, {});
}

export function configId(settings) {
  const s = normalizeSettings({ ...DEFAULT_GATE_SETTINGS, ...settings, gate_mode: "filter" });
  return [
    `exp=${s.exposure_mode}`,
    `budget=${s.exposure_token_budget}`,
    `maxb=${s.exposure_max_b}`,
    `probe=${s.intent_probe ? 1 : 0}`,
    `prompt=${s.intent_prompt ? 1 : 0}`,
    `dyn=${s.intent_dynamic ? 1 : 0}`,
    `cmp=${s.compress ? 1 : 0}`,
    `code=${s.code_mode ? 1 : 0}`,
  ].join(",");
}

export function buildConfigSettings(partial = {}) {
  return normalizeSettings({
    ...DEFAULT_GATE_SETTINGS,
    gate_mode: "filter",
    ...partial,
  });
}

export function settingsToMockEnv(settings, clientName) {
  const normalized = buildConfigSettings(settings);
  const envExtra = gateSettingsToEnv(normalized);
  return mockGateEnv(clientName, envExtra);
}

export async function measureTransparentBaseline(options = {}) {
  const env = mockGateEnv(options.clientName ?? "sweep-baseline", {
    COSTGATE_GATE_MODE: "transparent",
  });
  return withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      await client.initialize("sweep-baseline");
      const tools = await client.listTools();
      return summarizeTools(tools);
    },
    { label: "sweep-baseline", startupMs: options.startupMs ?? 5000 }
  );
}

export async function measureFilterConfig(settings, options = {}) {
  const id = configId(settings);
  const env = settingsToMockEnv(settings, `sweep-${id}`);
  const started = Date.now();
  const summary = await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      await client.initialize(`sweep-${id}`);
      const tools = await client.listTools();
      return summarizeTools(tools);
    },
    { label: `sweep-${id}`, startupMs: options.startupMs ?? 5000 }
  );
  return {
    ...summary,
    duration_ms: Date.now() - started,
    env,
  };
}

export async function runEvalForConfig(settings, tasks, options = {}) {
  const id = configId(settings);
  const env = settingsToMockEnv(settings, `sweep-eval-${id}`);
  const results = [];
  for (const task of tasks) {
    results.push(
      await runEvalTask(task, env, {
        label: `sweep-eval-${id}-${task.id}`,
        startupMs: options.startupMs ?? 4000,
      })
    );
  }
  return buildEvalReport(results, { config_id: id, settings: buildConfigSettings(settings) });
}

export function paretoFrontier(rows) {
  return rows.filter(
    (a) =>
      !rows.some(
        (b) =>
          b.config_id !== a.config_id &&
          b.eval_pass_rate >= a.eval_pass_rate &&
          b.tools_list_tokens <= a.tools_list_tokens &&
          (b.eval_pass_rate > a.eval_pass_rate || b.tools_list_tokens < a.tools_list_tokens)
      )
  );
}

export function buildSweepReport({
  grids,
  baseline,
  rows,
  tasksFile,
  replayFixtures = [],
}) {
  const enriched = rows.map((row) => ({
    ...row,
    token_reduction_pct: pctReduction(baseline.estimated_tokens, row.tools_list_tokens),
    token_reduction_tools_pct: pctReduction(baseline.tool_count, row.tool_count),
  }));
  const pareto = paretoFrontier(enriched);
  const paretoIds = new Set(pareto.map((r) => r.config_id));

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    grids,
    tasks_file: tasksFile,
    replay_fixtures: replayFixtures,
    baseline: {
      label: "gate-transparent",
      tool_count: baseline.tool_count,
      estimated_tokens: baseline.estimated_tokens,
      total_schema_bytes: baseline.total_schema_bytes,
    },
    summary: {
      configs: enriched.length,
      pareto_count: pareto.length,
      best_tokens: enriched.reduce(
        (best, r) => (r.tools_list_tokens < best.tools_list_tokens ? r : best),
        enriched[0]
      ),
      best_pass_rate: enriched.reduce(
        (best, r) => (r.eval_pass_rate > best.eval_pass_rate ? r : best),
        enriched[0]
      ),
    },
    pareto: pareto.map((r) => r.config_id),
    results: enriched.map((r) => ({ ...r, pareto: paretoIds.has(r.config_id) })),
  };
}

export function loadSweepTasks(tasksPath, replayPaths = []) {
  const tasks = [];
  if (tasksPath && existsSync(tasksPath)) {
    const spec = JSON.parse(readFileSync(tasksPath, "utf8"));
    tasks.push(...(spec.tasks ?? []));
  }
  for (const path of replayPaths) {
    const fixture = loadReplayFixture(path);
    tasks.push(replayFixtureToEvalTask(fixture));
  }
  return tasks;
}
