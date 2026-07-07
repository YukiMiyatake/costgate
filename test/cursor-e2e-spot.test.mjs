#!/usr/bin/env node
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSpotReport,
  loadCursorE2ePrompts,
  pickSpotConfigsFromSweep,
  renderSpotChecklist,
} from "../scripts/lib/cursor-e2e-spot.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testLoadPrompts() {
  const prompts = loadCursorE2ePrompts(join(ROOT, "test/eval/cursor-e2e-prompts.json"));
  assert(prompts.length >= 5, "prompt count");
  assert(prompts[0].id && prompts[0].prompt, "prompt shape");
  console.error("[cursor-e2e-spot] loadPrompts ok");
}

function testPickSweep() {
  const sweep = {
    results: [
      { config_id: "a", pareto: true, settings: { exposure_mode: "budget" } },
      { config_id: "b", pareto: true, settings: { exposure_mode: "aggressive" } },
      { config_id: "c", pareto: false, settings: { exposure_mode: "conservative" } },
    ],
  };
  const picked = pickSpotConfigsFromSweep(sweep, 2);
  assert(picked.length === 2, "pick top pareto");
  assert(picked[0].config_id === "a", "first pareto");
  console.error("[cursor-e2e-spot] pickSweep ok");
}

function testChecklist() {
  const report = buildSpotReport(
    [
      {
        config_id: "test",
        settings: {},
        summary: { prompts: 1, met: 1, failed: 0, pass_rate_pct: 100, discover_needed_count: 0, discover_needed_rate_pct: 0 },
        results: [
          {
            prompt_id: "github_pr",
            prompt: "Create PR",
            met: true,
            discover_needed: false,
            intent_keywords: "github pull",
          },
        ],
      },
    ],
    { mode: "mock" }
  );
  const md = renderSpotChecklist(report);
  assert(md.includes("github_pr"), "checklist prompt");
  assert(md.includes("- [ ]"), "checkbox");
  console.error("[cursor-e2e-spot] checklist ok");
}

function main() {
  testLoadPrompts();
  testPickSweep();
  testChecklist();
  console.error("[cursor-e2e-spot] all passed");
}

main();
