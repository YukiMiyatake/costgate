#!/usr/bin/env node
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mockJudgeShield } from "../scripts/lib/llm-judge.mjs";
import {
  buildShieldJudgeReport,
  judgeShieldPair,
  loadShieldPairs,
} from "../scripts/lib/shield-judge.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testMockShield() {
  const good = mockJudgeShield({
    original: "Deploy token=ghp_1234567890abcdefghijklmnopqrst for repo costgate/main",
    redacted: "Deploy token=[[CG:GITHUB_PAT:1]] for repo costgate/main",
    task_intent: "deploy",
  });
  assert(good.score >= 3, "good redaction score");

  const bad = mockJudgeShield({
    original: "token=ghp_1234567890abcdefghijklmnopqrst",
    redacted: "token=ghp_1234567890abcdefghijklmnopqrst",
  });
  assert(bad.score < 3, "leak score");
  console.error("[shield-judge] mock ok");
}

async function testFixture() {
  const path = join(ROOT, "test/fixtures/shield-judge/sample-pair.json");
  const [pair] = loadShieldPairs(path);
  const result = await judgeShieldPair(pair, { provider: "mock" });
  assert(result.score >= 3, "fixture score");
  const report = buildShieldJudgeReport([result], { provider: "mock" });
  assert(report.summary.passed === 1, "fixture pass");
  console.error("[shield-judge] fixture ok");
}

async function main() {
  testMockShield();
  await testFixture();
  console.error("[shield-judge] all passed");
}

main();
