#!/usr/bin/env node
import { computeExcludeScore, applyExcludeScores } from "../scripts/lib/tool-exclude-score.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testHiddenZero() {
  assert(computeExcludeScore({ tier: "hidden", call_count: 0 }) === 0, "hidden => 0");
}

function testStaleTierC() {
  const score = computeExcludeScore(
    {
      tier: "C",
      call_count: 0,
      stale_days: 120,
      estimated_list_tokens: 500,
      recommendation: "stale_90d",
    },
    { p90: 400 }
  );
  assert(score >= 85, `stale tier C high score, got ${score}`);
}

function testHighCostUnused() {
  const score = computeExcludeScore(
    {
      tier: "B",
      call_count: 0,
      stale_days: 45,
      estimated_list_tokens: 800,
      recommendation: "high_cost_unused",
    },
    { p90: 500 }
  );
  assert(score >= 65, `high cost unused score, got ${score}`);
}

function testActiveLow() {
  const score = computeExcludeScore(
    { tier: "A", call_count: 50, stale_days: 1, estimated_list_tokens: 100 },
    { p90: 500 }
  );
  assert(score < 30, `active tool low score, got ${score}`);
}

function testApplyBatch() {
  const tools = [
    { name: "a", tier: "C", call_count: 0, stale_days: 100, estimated_list_tokens: 300 },
    { name: "b", tier: "A", call_count: 10, stale_days: 1, estimated_list_tokens: 50 },
  ];
  applyExcludeScores(tools, [100, 200, 300]);
  assert(tools[0].exclude_score > tools[1].exclude_score, "unused ranks higher");
}

testHiddenZero();
testStaleTierC();
testHighCostUnused();
testActiveLow();
testApplyBatch();
console.error("[tool-exclude-score] all passed");
