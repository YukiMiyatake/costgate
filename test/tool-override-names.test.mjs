#!/usr/bin/env node
import {
  qualifyOverrideToolName,
  resolveToolOverride,
  isMultiBackend,
} from "../scripts/lib/tool-override-names.mjs";
import { toolOverridesGeneration } from "../scripts/lib/dashboard-control.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  qualifyOverrideToolName("search_code", "github") === "github/search_code",
  "qualify bare name"
);
assert(
  qualifyOverrideToolName("github/search_code", "github") === "github/search_code",
  "keep qualified"
);
assert(
  resolveToolOverride("search_code", "github", {
    "github/search_code": { force_tier: "hidden" },
  })?.force_tier === "hidden",
  "resolve qualified"
);
assert(
  resolveToolOverride("search_code", "github", {
    search_code: { force_tier: "hidden" },
  })?.force_tier === "hidden",
  "resolve legacy bare"
);
assert(isMultiBackend({ a: {}, b: {} }), "multi backend");
assert(!isMultiBackend({ a: {} }), "single backend");
assert(
  toolOverridesGeneration({ version: 1, tools: {} }) ===
    toolOverridesGeneration({ version: 1, tools: {} }),
  "stable overrides generation"
);

console.error("[tool-override-names] ok");
