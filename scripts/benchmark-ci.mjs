#!/usr/bin/env node
/**
 * Phase 18 — CI-safe benchmark assertions (mock MCP, no GitHub token).
 *
 *   npm run benchmark:ci
 *   npm run benchmark:ci -- --json
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GATE_BIN = process.env.COSTGATE_GATE_BIN ?? join(ROOT, "packages/gate/bin/costgate-gate");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");

const LIMITS = {
  mock: {
    min_reduction_pct: 40,
    max_filter_tokens: 500,
    max_filter_tools: 12,
  },
};

function runCompareMock() {
  const r = spawnSync("node", [join(ROOT, "scripts/compare-report.mjs"), "--mock", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "compare --mock failed");
  }
  return JSON.parse(r.stdout);
}

function assertBenchmark(report) {
  const limits = LIMITS.mock;
  const errors = [];
  const after = report.after;
  const reduction = report.reduction;

  if (after.estimated_tokens > limits.max_filter_tokens) {
    errors.push(
      `filter tokens ${after.estimated_tokens} > max ${limits.max_filter_tokens}`
    );
  }
  if (after.tool_count > limits.max_filter_tools) {
    errors.push(`filter tools ${after.tool_count} > max ${limits.max_filter_tools}`);
  }
  if (reduction.tokens_pct < limits.min_reduction_pct) {
    errors.push(
      `token reduction ${reduction.tokens_pct}% < min ${limits.min_reduction_pct}%`
    );
  }
  return errors;
}

async function main() {
  if (!existsSync(GATE_BIN)) {
    console.error("[benchmark:ci] gate binary missing. Run: npm run build:gate");
    process.exit(1);
  }

  const report = runCompareMock();
  const errors = assertBenchmark(report);
  const result = {
    passed: errors.length === 0,
    limits: LIMITS.mock,
    compare: report,
    errors,
  };

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("# CostGate benchmark CI\n");
    console.log(`Before: ${report.before.tool_count} tools, ~${report.before.estimated_tokens} tokens`);
    console.log(`After:  ${report.after.tool_count} tools, ~${report.after.estimated_tokens} tokens`);
    console.log(`Reduction: ${report.reduction.tokens_pct}% tokens\n`);
    if (errors.length) {
      for (const e of errors) console.log(`❌ ${e}`);
    } else {
      console.log("✅ All benchmark assertions passed.");
    }
  }

  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error("[benchmark:ci] fatal:", e);
  process.exit(1);
});
