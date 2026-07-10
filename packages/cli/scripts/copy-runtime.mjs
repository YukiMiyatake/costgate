#!/usr/bin/env node
/**
 * Bundle scripts/, catalog/, and examples into packages/cli/runtime for npm publish.
 * Maintainer-only scripts are excluded (see RUNTIME_SCRIPT_EXCLUDE).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLI_PKG = join(fileURLToPath(import.meta.url), "..", "..");
const REPO = join(CLI_PKG, "..", "..");

/** Top-level scripts/ entries omitted from @costgate/cli npm bundle. */
export const RUNTIME_SCRIPT_EXCLUDE = new Set([
  "feat-workflow.mjs",
  "install-git-hooks.mjs",
  "release-version.mjs",
  "publish-check.mjs",
  "check-syntax.mjs",
  "npm-help.mjs",
  "benchmark-ci.mjs",
  "shield-judge.mjs",
  "compress-judge.mjs",
  "cursor-e2e-spot.mjs",
  "optimize-sweep.mjs",
  "docker-run.mjs",
  "cloud-upload.mjs",
  "session-replay-export.mjs",
]);

/** scripts/lib/ entries omitted from npm bundle (dev/eval only). */
export const RUNTIME_LIB_EXCLUDE = new Set([
  "eval-harness.mjs",
  "cursor-e2e-spot.mjs",
  "shield-judge.mjs",
  "compress-judge.mjs",
  "llm-judge.mjs",
  "optimize-sweep.mjs",
]);

export function copyDirFiltered(from, to, exclude) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory() && entry.name === "lib") {
      copyDirFiltered(src, dest, RUNTIME_LIB_EXCLUDE);
      continue;
    }
    cpSync(src, dest, { recursive: true });
  }
}

export function copyRuntime(options = {}) {
  const cliPkg = options.cliPkg ?? CLI_PKG;
  const repoRoot = options.repoRoot ?? REPO;
  const runtimeDir = options.runtimeDir ?? join(cliPkg, "runtime");

  const copyPlan = [
    { from: join(repoRoot, "scripts"), to: join(runtimeDir, "scripts"), kind: "scripts" },
    {
      from: join(repoRoot, "catalog", "marketplace"),
      to: join(runtimeDir, "catalog", "marketplace"),
      kind: "plain",
    },
  ];

  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(join(runtimeDir, "examples"), { recursive: true });

  for (const { from, to, kind } of copyPlan) {
    if (!existsSync(from)) {
      throw new Error(`[copy-runtime] missing: ${from}`);
    }
    mkdirSync(dirname(to), { recursive: true });
    if (kind === "scripts") {
      copyDirFiltered(from, to, RUNTIME_SCRIPT_EXCLUDE);
    } else {
      cpSync(from, to, { recursive: true });
    }
  }

  cpSync(
    join(repoRoot, "examples", "backends.github.json"),
    join(runtimeDir, "examples", "backends.github.json")
  );

  return runtimeDir;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const out = copyRuntime();
  console.log(`[copy-runtime] → ${out}`);
}
