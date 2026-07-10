#!/usr/bin/env node
/**
 * Shield redact golden cases — JS port must match Go redact.go behavior.
 */
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { Mode, redactString, redactText } from "../scripts/lib/shield-redact.mjs";
import { ShieldVault } from "../scripts/lib/shield-vault.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "test/fixtures/shield-redact-golden.json");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function modeFromName(name) {
  switch (String(name ?? "secrets").toLowerCase()) {
    case "full":
      return Mode.Full;
    case "aggressive":
      return Mode.Aggressive;
    default:
      return Mode.Secrets;
  }
}

function runCase(testCase, vault) {
  const mode = modeFromName(testCase.mode);
  const input = String(testCase.input ?? "");
  const out = input.trimStart().startsWith("{") ? redactText(input, mode, vault) : redactString(input, mode, vault);

  for (const needle of testCase.must_not_contain ?? []) {
    assert(!out.includes(needle), `${testCase.id}: leaked "${needle}"`);
  }
  for (const needle of testCase.must_contain ?? []) {
    assert(out.includes(needle), `${testCase.id}: missing "${needle}" in ${out}`);
  }
  for (const needle of testCase.must_preserve ?? []) {
    assert(out.includes(needle), `${testCase.id}: lost "${needle}"`);
  }
  return out;
}

function goAvailable() {
  return spawnSync("go", ["version"], { stdio: "ignore" }).status === 0;
}

function testJsGolden() {
  const dir = join(ROOT, ".tmp-shield-golden");
  rmSync(dir, { recursive: true, force: true });
  const vault = new ShieldVault({ dir, sessionId: "golden-js" });
  const { cases } = JSON.parse(readFileSync(FIXTURE, "utf8"));
  for (const testCase of cases) {
    runCase(testCase, vault);
  }
  rmSync(dir, { recursive: true, force: true });
  console.error("[shield-golden] JS cases ok");
}

function testGoGolden() {
  if (!goAvailable()) {
    console.error("[shield-golden] Go skipped (go not installed)");
    return;
  }
  execSync("go test ./internal/shield/ -run TestRedactGoldenFixture -count=1", {
    cwd: join(ROOT, "packages", "gate"),
    env: {
      ...process.env,
      COSTGATE_REDACT_GOLDEN_FIXTURE: FIXTURE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.error("[shield-golden] Go fixture ok");
}

testJsGolden();
testGoGolden();
console.error("[shield-golden] all passed");
