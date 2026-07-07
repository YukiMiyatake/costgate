/**
 * P8 — Cursor Agent E2E spot-check harness (MCP proxy layer).
 * Simulates first-turn tool exposure per fixed prompt + gate settings.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withMcpProcess, extractResultText } from "./mcp-client.mjs";
import { gateBin, mockGateEnv } from "./paths.mjs";
import { buildConfigSettings, configId, settingsToMockEnv } from "./optimize-sweep.mjs";
import { inferPromptIntent } from "./prompt-intent.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const DEFAULT_PROMPTS_PATH = join(ROOT, "test/eval/cursor-e2e-prompts.json");

export function loadCursorE2ePrompts(path = DEFAULT_PROMPTS_PATH) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw.prompts ?? raw;
}

export function pickSpotConfigsFromSweep(sweepReport, topN = 3) {
  const rows = sweepReport?.results ?? [];
  const pareto = rows.filter((r) => r.pareto);
  const picked = (pareto.length ? pareto : rows).slice(0, topN);
  return picked.map((r) => ({
    config_id: r.config_id,
    settings: r.settings ?? buildConfigSettings(r),
  }));
}

function seedPromptIntent(env, prompt) {
  if (!env.COSTGATE_PROMPT_INTENT_DIR) return;
  const intent = inferPromptIntent({ prompt });
  mkdirSync(env.COSTGATE_PROMPT_INTENT_DIR, { recursive: true });
  writeFileSync(
    join(env.COSTGATE_PROMPT_INTENT_DIR, "latest.json"),
    `${JSON.stringify(
      {
        keywords: intent.keywords,
        templates: intent.templates,
        ts: Date.now(),
        conversation_id: "cursor-e2e-spot",
        generation_id: "spot",
        sources: intent.sources,
      },
      null,
      2
    )}\n`
  );
}

/**
 * Run one spot prompt against Gate (mock MCP).
 */
export async function runSpotPrompt(promptSpec, settings, options = {}) {
  const gate = gateBin();
  if (!existsSync(gate)) {
    throw new Error(`gate binary not found: ${gate}`);
  }

  const normalized = buildConfigSettings({
    intent_dynamic: true,
    intent_prompt: true,
    intent_probe: false,
    ...settings,
  });
  const env = settingsToMockEnv(normalized, `spot-${promptSpec.id}`);
  seedPromptIntent(env, promptSpec.prompt);

  const expected = promptSpec.expect_tools_any ?? [];
  let exposed = [];
  let discoverText = "";

  await withMcpProcess(
    gate,
    [],
    env,
    async (client) => {
      await client.initialize(`spot-${promptSpec.id}`);
      exposed = (await client.listTools()).map((t) => t.name);
      if (promptSpec.expect_discover_query) {
        const res = await client.callTool("discover_tools", {
          query: promptSpec.expect_discover_query,
          limit: 8,
        });
        discoverText = extractResultText(res);
      }
    },
    { label: `spot-${promptSpec.id}`, startupMs: options.startupMs ?? 4000 }
  );

  const inList = expected.filter((t) => exposed.includes(t));
  const viaDiscover = expected.filter((t) => discoverText.includes(t));
  const met = inList.length > 0 || viaDiscover.length > 0;
  const discoverNeeded = inList.length === 0 && viaDiscover.length > 0;
  const discoverFailed = !met;

  return {
    prompt_id: promptSpec.id,
    prompt: promptSpec.prompt,
    met,
    discover_needed: discoverNeeded,
    discover_failed: discoverFailed,
    exposed_count: exposed.length,
    tools_in_list: inList,
    tools_via_discover: viaDiscover,
    intent_keywords: inferPromptIntent({ prompt: promptSpec.prompt }).keywords,
  };
}

export async function runSpotConfig(settings, prompts, options = {}) {
  const normalized = buildConfigSettings(settings);
  const id = options.config_id ?? configId(normalized);
  const results = [];
  for (const prompt of prompts) {
    results.push(await runSpotPrompt(prompt, normalized, options));
  }
  const met = results.filter((r) => r.met).length;
  const discoverNeeded = results.filter((r) => r.discover_needed).length;
  return {
    config_id: id,
    settings: normalized,
    summary: {
      prompts: results.length,
      met,
      failed: results.length - met,
      pass_rate_pct: results.length
        ? Math.round((met / results.length) * 1000) / 10
        : 0,
      discover_needed_count: discoverNeeded,
      discover_needed_rate_pct: results.length
        ? Math.round((discoverNeeded / results.length) * 1000) / 10
        : 0,
    },
    results,
  };
}

export function buildSpotReport(configRuns, meta = {}) {
  const allResults = configRuns.flatMap((c) => c.results);
  const met = allResults.filter((r) => r.met).length;
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: meta.mode ?? "mock",
    prompts_file: meta.prompts_file ?? DEFAULT_PROMPTS_PATH,
    configs: configRuns.length,
    summary: {
      prompts_total: allResults.length,
      met,
      failed: allResults.length - met,
      pass_rate_pct: allResults.length
        ? Math.round((met / allResults.length) * 1000) / 10
        : 0,
      discover_needed_rate_pct: allResults.length
        ? Math.round(
            (allResults.filter((r) => r.discover_needed).length / allResults.length) * 1000
          ) / 10
        : 0,
    },
    config_runs: configRuns,
    ...meta,
  };
}

export function renderSpotChecklist(report) {
  const lines = ["# Cursor E2E Spot Check (manual)", ""];
  lines.push(`Generated: ${report.generated_at}`);
  lines.push("");
  lines.push("Run each prompt in **Cursor Agent** with costgate-gate enabled.");
  lines.push("Mark pass if the agent completes the task without wrong-tool detours.");
  lines.push("");
  for (const run of report.config_runs) {
    lines.push(`## Config: ${run.config_id}`);
    lines.push("");
    for (const r of run.results) {
      const proxy = r.met ? "proxy: pass" : "proxy: FAIL";
      lines.push(`- [ ] **${r.prompt_id}** (${proxy})`);
      lines.push(`  - Prompt: ${r.prompt}`);
      lines.push(`  - Intent: ${r.intent_keywords || "—"}`);
      if (r.discover_needed) {
        lines.push(`  - Note: proxy needed discover_tools`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function loadSweepReport(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
