#!/usr/bin/env node
/**
 * Unit tests for LLM judge + compression judge (mock only).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clipJudgeText,
  mockJudgeCompression,
  parseJudgeJson,
  resolveJudgeConfig,
} from "../scripts/lib/llm-judge.mjs";
import {
  buildCompressJudgeReport,
  buildCompressionJudgePrompt,
  judgeCompressionPair,
  loadCompressPairs,
} from "../scripts/lib/compress-judge.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testParseJudgeJson() {
  const parsed = parseJudgeJson('{"score":4.5,"missing_facts":["x"],"rationale":"ok"}');
  assert(parsed.score === 4.5, "score");
  assert(parsed.missing_facts[0] === "x", "missing");
  console.error("[compress-judge] parseJudgeJson ok");
}

function testMockJudge() {
  const high = mockJudgeCompression({
    original: "package-lock.json dependencies express typescript mock-data-value",
    compressed: "summary dependencies express typescript mock-data-value",
  });
  assert(high.score >= 3, "high retention score");

  const low = mockJudgeCompression({
    original: "alpha beta gamma delta epsilon zeta",
    compressed: "ok",
  });
  assert(low.score <= 2, "low retention score");
  console.error("[compress-judge] mockJudge ok");
}

async function testJudgePairFixture() {
  const path = join(ROOT, "test/fixtures/compress-judge/sample-pair.json");
  const [pair] = loadCompressPairs(path);
  const result = await judgeCompressionPair(pair, { provider: "mock" });
  assert(result.score >= 1 && result.score <= 5, "score range");
  assert(result.pair_id === "mock-lockfile", "pair id");

  const prompt = buildCompressionJudgePrompt(pair);
  assert(prompt.includes("ORIGINAL"), "prompt sections");
  assert(clipJudgeText("x".repeat(20_000)).includes("truncated"), "clip");

  const report = buildCompressJudgeReport([result], { provider: "mock" });
  assert(report.summary.pairs === 1, "report pairs");
  console.error("[compress-judge] fixture ok");
}

function testResolveConfig() {
  const prev = process.env.COSTGATE_JUDGE_PROVIDER;
  process.env.COSTGATE_JUDGE_PROVIDER = "mock";
  assert(resolveJudgeConfig().provider === "mock", "provider mock");
  if (prev === undefined) delete process.env.COSTGATE_JUDGE_PROVIDER;
  else process.env.COSTGATE_JUDGE_PROVIDER = prev;
  console.error("[compress-judge] resolveConfig ok");
}

async function main() {
  testParseJudgeJson();
  testMockJudge();
  testResolveConfig();
  await testJudgePairFixture();
  console.error("[compress-judge] all passed");
}

main();
