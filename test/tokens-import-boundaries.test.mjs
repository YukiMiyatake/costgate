#!/usr/bin/env node
/**
 * Guard: benchmark/compare must use tiktoken (tokens.mjs), not Dashboard estimate.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const mcpClient = read("scripts/lib/mcp-client.mjs");
assert(
  mcpClient.includes('from "./tokens.mjs"'),
  "mcp-client must import from tokens.mjs (tiktoken)"
);
assert(
  !mcpClient.includes("tokens-estimate"),
  "mcp-client must not import tokens-estimate"
);

const benchmarkCi = read("scripts/benchmark-ci.mjs");
assert(
  !benchmarkCi.includes("tokens-estimate"),
  "benchmark-ci must not import tokens-estimate"
);

const dashboardProbe = read("scripts/lib/dashboard-backend-probe.mjs");
assert(
  dashboardProbe.includes('from "./tokens-estimate.mjs"'),
  "dashboard-backend-probe must use tokens-estimate"
);

const parseLogs = read("scripts/lib/parse-probe-logs.mjs");
assert(
  parseLogs.includes('from "./tokens-estimate.mjs"'),
  "parse-probe-logs must use tokens-estimate"
);

console.log("[tokens-import-boundaries] ok");
