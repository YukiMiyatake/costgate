#!/usr/bin/env node
/**
 * Bundle scripts/, catalog/, and examples into packages/cli/runtime for npm publish.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PKG = join(fileURLToPath(import.meta.url), "..", "..");
const REPO = join(CLI_PKG, "..", "..");
const RUNTIME = join(CLI_PKG, "runtime");

const COPY = [
  { from: join(REPO, "scripts"), to: join(RUNTIME, "scripts") },
  { from: join(REPO, "catalog", "marketplace"), to: join(RUNTIME, "catalog", "marketplace") },
];

rmSync(RUNTIME, { recursive: true, force: true });
mkdirSync(RUNTIME, { recursive: true });
mkdirSync(join(RUNTIME, "examples"), { recursive: true });

for (const { from, to } of COPY) {
  if (!existsSync(from)) {
    throw new Error(`[copy-runtime] missing: ${from}`);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

cpSync(
  join(REPO, "examples", "backends.github.json"),
  join(RUNTIME, "examples", "backends.github.json")
);

console.log(`[copy-runtime] → ${RUNTIME}`);
