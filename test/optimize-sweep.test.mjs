#!/usr/bin/env node
/**
 * Unit tests for optimize-sweep grid + session replay (no Gate spawn).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cartesianGrid,
  configId,
  parseGridArgs,
  parseGridValue,
  paretoFrontier,
  buildSweepReport,
} from "../scripts/lib/optimize-sweep.mjs";
import {
  listProbeSessions,
  loadReplayFixture,
  replayFixtureToEvalTask,
  sessionToReplayFixture,
} from "../scripts/lib/session-replay.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testParseGrid() {
  const grids = parseGridArgs([
    "--grid",
    "exposure_mode=conservative,budget",
    "--grid",
    "intent_source=env,probe",
  ]);
  assert(grids.exposure_mode.length === 2, "exposure_mode values");
  assert(grids.intent_source.length === 2, "intent_source values");
  const combos = cartesianGrid(grids);
  assert(combos.length === 4, `expected 4 combos, got ${combos.length}`);
  assert(parseGridValue("exposure_token_budget", "8000") === 8000, "number parse");
  console.error("[optimize-sweep] parseGrid ok");
}

function testConfigId() {
  const id = configId({ exposure_mode: "budget", exposure_token_budget: 8000 });
  assert(id.includes("exp=budget"), "config id exposure");
  assert(id.includes("budget=8000"), "config id budget");
  console.error("[optimize-sweep] configId ok");
}

function testPareto() {
  const rows = [
    { config_id: "a", tools_list_tokens: 5000, eval_pass_rate: 100 },
    { config_id: "b", tools_list_tokens: 4000, eval_pass_rate: 90 },
    { config_id: "c", tools_list_tokens: 6000, eval_pass_rate: 80 },
  ];
  const front = paretoFrontier(rows);
  assert(front.some((r) => r.config_id === "a"), "a on front");
  assert(front.some((r) => r.config_id === "b"), "b on front");
  assert(!front.some((r) => r.config_id === "c"), "c dominated");
  const report = buildSweepReport({
    grids: { exposure_mode: ["conservative"] },
    baseline: { tool_count: 16, estimated_tokens: 10000, total_schema_bytes: 1 },
    rows: rows.map((r) => ({
      ...r,
      tool_count: 8,
      total_schema_bytes: 1,
      measure_duration_ms: 100,
      eval_passed: r.eval_pass_rate,
      eval_total: 100,
      p50_duration_ms: 50,
    })),
    tasksFile: "test/eval/sweep-tasks.json",
  });
  assert(report.pareto.length === 2, "pareto count in report");
  console.error("[optimize-sweep] pareto ok");
}

function testSessionReplay() {
  const sample = join(ROOT, "test/fixtures/dashboard/probe-sample.jsonl");
  const events = readFileSync(sample, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const fixture = sessionToReplayFixture(events, {
    sessionId: "sess-001",
    id: "sample",
    include_prompt_intent: true,
  });
  assert(fixture.seed_probe_log.length >= 1, "probe seed tools");
  assert(fixture.seed_prompt_intent?.keywords, "prompt keywords");

  const fixturePath = join(ROOT, "test/eval/replay-fixtures/sample-github-session.json");
  const loaded = loadReplayFixture(fixturePath);
  const task = replayFixtureToEvalTask(loaded);
  assert(task.id === "sample-github-session", "replay task id");
  assert(task.seed_probe_log.length === 3, "replay seed count");

  const sessions = listProbeSessions(join(ROOT, "test/fixtures/dashboard"));
  assert(sessions.length >= 1, "list sessions");
  console.error("[optimize-sweep] sessionReplay ok");
}

function main() {
  testParseGrid();
  testConfigId();
  testPareto();
  testSessionReplay();
  console.error("[optimize-sweep] all passed");
}

main();
