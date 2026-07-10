#!/usr/bin/env node
/**
 * Guard: documented npm scripts must exist in package.json.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const scripts = pkg.scripts ?? {};

const REQUIRED = [
  "compare",
  "test:gate",
  "test:ci",
  "test:local",
  "compress-report",
  "session-report",
  "dashboard:test",
  "check:syntax",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

for (const name of REQUIRED) {
  assert(typeof scripts[name] === "string" && scripts[name].length > 0, `missing script: ${name}`);
}

// test:local should not duplicate test:ci-only scripts
const local = scripts["test:local"];
assert(local.includes("test:gate"), "test:local must include test:gate");
assert(!local.match(/test:gate:filter/), "test:local must not duplicate test:gate:filter (in test:ci)");

console.error("[package-scripts] ok");
