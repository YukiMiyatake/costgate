#!/usr/bin/env node
import {
  computeExcludeScore,
  applyExcludeScores,
  collectListTokenSamples,
  summarizeExcludeCandidates,
  isExcludeRecommended,
} from "../scripts/lib/tool-exclude-score.mjs";

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
    { p90: 500, p50: 300 }
  );
  assert(score < 30, `active tool low score, got ${score}`);
}

function testActiveTierANotZero() {
  const score = computeExcludeScore(
    { tier: "A", call_count: 10, stale_days: 0, estimated_list_tokens: null },
    { p90: 0, p50: 0 }
  );
  assert(score > 0, `active tier A should not be zero, got ${score}`);
}

function testCollectSamplesFromTools() {
  const samples = collectListTokenSamples(
    [{ estimated_list_tokens: 200 }, { estimated_list_tokens: 400 }],
    [100]
  );
  assert(samples.length === 3, "merged samples");
  const tools = [{ tier: "C", call_count: 0, stale_days: 100, estimated_list_tokens: 400 }];
  applyExcludeScores(tools, [100]);
  assert(tools[0].exclude_score >= 50, `scored with tool samples, got ${tools[0].exclude_score}`);
}

function testApplyBatch() {
  const tools = [
    { name: "a", tier: "C", call_count: 0, stale_days: 100, estimated_list_tokens: 300 },
    { name: "b", tier: "A", call_count: 10, stale_days: 1, estimated_list_tokens: 50 },
  ];
  applyExcludeScores(tools, [100, 200, 300]);
  assert(tools[0].exclude_score > tools[1].exclude_score, "unused ranks higher");
}

function testSummarizeCandidates() {
  const tools = [
    { name: "hide-me", tier: "C", exclude_score: 80, estimated_list_tokens: 200 },
    { name: "already", tier: "hidden", exclude_score: 90, estimated_list_tokens: 500 },
    { name: "keep", tier: "A", exclude_score: 5, estimated_list_tokens: 100 },
    { name: "locked", tier: "B", exclude_score: 90, exclude_lock: true, estimated_list_tokens: 300 },
    { name: "pinned", tier: "B", exclude_score: 90, always_expose: true, estimated_list_tokens: 400 },
  ];
  const summary = summarizeExcludeCandidates(tools);
  assert(summary.count === 1, "one candidate");
  assert(summary.tokensSaved === 200, "token sum");
  assert(summary.candidates[0].name === "hide-me", "right tool");
}

function testExcludeLockSkipsScore() {
  assert(
    !isExcludeRecommended({ tier: "C", exclude_score: 99, exclude_lock: true }),
    "locked tool not recommended"
  );
  assert(
    !isExcludeRecommended({ tier: "C", exclude_score: 99, always_expose: true }),
    "pinned tool not recommended"
  );
}

testHiddenZero();
testStaleTierC();
testHighCostUnused();
testActiveLow();
testActiveTierANotZero();
testCollectSamplesFromTools();
testApplyBatch();
testSummarizeCandidates();
testExcludeLockSkipsScore();
console.error("[tool-exclude-score] all passed");
