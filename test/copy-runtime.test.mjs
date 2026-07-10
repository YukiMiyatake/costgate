#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RUNTIME_LIB_EXCLUDE,
  RUNTIME_SCRIPT_EXCLUDE,
  copyRuntime,
} from "../packages/cli/scripts/copy-runtime.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(ROOT, ".tmp-copy-runtime-test");

function test(name, fn) {
  try {
    fn();
    console.error(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

test("copyRuntime excludes maintainer scripts", () => {
  rmSync(RUNTIME, { recursive: true, force: true });
  copyRuntime({ runtimeDir: RUNTIME, repoRoot: ROOT, cliPkg: join(ROOT, "packages", "cli") });

  assert(existsSync(join(RUNTIME, "scripts", "costgate-gate-launch.mjs")), "gate launch bundled");
  assert(existsSync(join(RUNTIME, "scripts", "dashboard-server.mjs")), "dashboard bundled");
  assert(!existsSync(join(RUNTIME, "scripts", "feat-workflow.mjs")), "feat-workflow excluded");
  assert(!existsSync(join(RUNTIME, "scripts", "install-git-hooks.mjs")), "hooks installer excluded");
  assert(!existsSync(join(RUNTIME, "scripts", "benchmark-ci.mjs")), "benchmark-ci excluded");

  for (const name of RUNTIME_SCRIPT_EXCLUDE) {
    assert(!existsSync(join(RUNTIME, "scripts", name)), `excluded: ${name}`);
  }

  assert(existsSync(join(RUNTIME, "scripts", "lib", "shield-redact.mjs")), "shield-redact lib kept");
  for (const name of RUNTIME_LIB_EXCLUDE) {
    assert(!existsSync(join(RUNTIME, "scripts", "lib", name)), `lib excluded: ${name}`);
  }

  assert(existsSync(join(RUNTIME, "catalog", "marketplace")), "marketplace bundled");
  assert(existsSync(join(RUNTIME, "examples", "backends.github.json")), "example bundled");
  rmSync(RUNTIME, { recursive: true, force: true });
});

if (process.exitCode) process.exit(process.exitCode);
console.error("[copy-runtime] all passed");
