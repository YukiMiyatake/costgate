#!/usr/bin/env node
/**
 * Regression guard: compare --mock must measure transparent (full list) vs filter.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GATE_BIN = join(ROOT, "packages/gate/bin/costgate-gate");
const MOCK_TOOLS = 16;
const MIN_REDUCTION_PCT = 30;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

if (!existsSync(GATE_BIN)) {
  console.error("[compare-mock-contract] gate missing. Run: npm run build:gate");
  process.exit(1);
}

const r = spawnSync("node", [join(ROOT, "scripts/compare-report.mjs"), "--mock", "--json"], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});
if (r.status !== 0) {
  throw new Error(r.stderr || r.stdout || "compare --mock failed");
}

const report = JSON.parse(r.stdout);
assert(report.before.tool_count === MOCK_TOOLS, `before tools: ${report.before.tool_count} != ${MOCK_TOOLS}`);
assert(report.after.tool_count < report.before.tool_count, "filter should reduce tool count");
assert(
  report.reduction.tokens_pct >= MIN_REDUCTION_PCT,
  `token reduction ${report.reduction.tokens_pct}% < min ${MIN_REDUCTION_PCT}%`
);

console.log(
  `[compare-mock-contract] ok (${report.before.tool_count} -> ${report.after.tool_count} tools, ${report.reduction.tokens_pct}% tokens)`
);
