#!/usr/bin/env node
/**
 * Cheap length/4 token estimates (Dashboard / log parsing paths).
 * Must run without js-tiktoken.
 */
import {
  countTokens,
  bytesToTokens,
  summarizeTools,
  TOKEN_ENCODING,
} from "../scripts/lib/tokens-estimate.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(TOKEN_ENCODING === "estimate", "encoding marker");

assert(countTokens("") === 0, "empty string");
assert(countTokens(null) === 0, "null");
assert(countTokens("abcd") === 1, "4 chars -> 1 token");
assert(countTokens("hello world") === 3, "11 chars -> ceil(11/4)");

assert(bytesToTokens(0) === 0, "zero bytes");
assert(bytesToTokens(-1) === 0, "negative bytes");
assert(bytesToTokens(100) === 25, "bytes fallback");

const tools = [
  { name: "echo", description: "Echo text", inputSchema: { type: "object" } },
  { name: "ping", description: "Ping", inputSchema: { type: "object" } },
];
const summary = summarizeTools(tools);
assert(summary.tool_count === 2, "tool count");
assert(summary.total_schema_bytes > 0, "schema bytes");
assert(summary.estimated_tokens > 0, "estimated tokens");
assert(summary.tools.every((t) => t.estimated_tokens > 0), "per-tool tokens");
assert(
  summary.estimated_tokens === summary.tools.reduce((s, t) => s + t.estimated_tokens, 0),
  "total equals sum"
);

console.log("[tokens-estimate] ok");
