#!/usr/bin/env node
/**
 * cl100k_base token counter (@costgate/probe / js-tiktoken).
 * Used by compare, benchmark CI, and integration tests — not Dashboard.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { countTokens, bytesToTokens, TOKEN_ENCODING, summarizeTools } from "../scripts/lib/tokens.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(TOKEN_ENCODING === "cl100k_base", "encoding");

assert(countTokens("") === 0, "empty string");
assert(countTokens("hello world") === 2, "hello world -> 2 tokens");

const json = JSON.stringify({ name: "search_code", type: "object" });
assert(countTokens(json) > 0, "json tokens");

assert(bytesToTokens(0) === 0, "zero bytes");
assert(bytesToTokens(100) === 25, "bytes fallback");

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures/token-tool-schemas.json");
const tools = JSON.parse(readFileSync(fixture, "utf8"));
const summary = summarizeTools(tools);
assert(summary.tool_count === tools.length, "summarize tool_count");
assert(summary.estimated_tokens > 0, "summarize total tokens");
assert(summary.total_schema_bytes > 0, "summarize schema bytes");

console.log("[tokens-probe] ok");
