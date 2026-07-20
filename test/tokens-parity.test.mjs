#!/usr/bin/env node
/**
 * Contract: length/4 estimate must stay within a sane band of cl100k_base counts.
 * Benchmark/compare paths rely on tiktoken; Dashboard uses estimate.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { countTokens as estimateCount, summarizeTools as estimateSummarize } from "../scripts/lib/tokens-estimate.mjs";
import { countTokens as probeCount, summarizeTools as probeSummarize } from "../scripts/lib/tokens.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "test/fixtures/token-tool-schemas.json");

/** Per-string ratio bounds (estimate / tiktoken). */
const MIN_RATIO = 0.45;
const MAX_RATIO = 2.5;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function ratio(estimate, probe) {
  if (probe <= 0) return estimate <= 0 ? 1 : Infinity;
  return estimate / probe;
}

function assertRatio(label, estimate, probe) {
  const r = ratio(estimate, probe);
  assert(
    r >= MIN_RATIO && r <= MAX_RATIO,
    `${label}: estimate=${estimate} probe=${probe} ratio=${r.toFixed(2)} outside [${MIN_RATIO}, ${MAX_RATIO}]`
  );
}

const samples = [
  "",
  "hello world",
  JSON.stringify({ name: "search_code", type: "object", properties: {} }),
  "日本語テキストと ASCII mixed content for token parity",
];

for (const text of samples) {
  assertRatio(`countTokens(${JSON.stringify(text.slice(0, 24))}...)`, estimateCount(text), probeCount(text));
}

const tools = JSON.parse(readFileSync(FIXTURE, "utf8"));
const est = estimateSummarize(tools);
const probe = probeSummarize(tools);

assert(est.tool_count === probe.tool_count, "summarize tool_count");
assertRatio("summarizeTools total", est.estimated_tokens, probe.estimated_tokens);

for (let i = 0; i < tools.length; i++) {
  assertRatio(
    `tool ${tools[i].name}`,
    est.tools[i].estimated_tokens,
    probe.tools[i].estimated_tokens
  );
}

console.log(
  `[tokens-parity] ok (estimate=${est.estimated_tokens}, probe=${probe.estimated_tokens}, ratio=${ratio(est.estimated_tokens, probe.estimated_tokens).toFixed(2)})`
);
