#!/usr/bin/env node
/**
 * Syntax-check all .mjs under scripts/ and test/ (excludes .generated).
 * CI: npm run check:syntax
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SKIP_DIRS = new Set(["node_modules", ".generated"]);

function collectMjs(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) collectMjs(p, acc);
    else if (ent.name.endsWith(".mjs")) acc.push(p);
  }
  return acc;
}

const root = process.cwd();
const files = [
  ...collectMjs(join(root, "scripts")),
  ...collectMjs(join(root, "test")),
].sort();

let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ["--check", file], { stdio: "pipe" });
  if (r.status !== 0) {
    process.stderr.write(`[check:syntax] ${file}\n${r.stderr?.toString() ?? ""}`);
    failed += 1;
  }
}

if (failed) {
  process.stderr.write(`[check:syntax] ${failed} file(s) failed\n`);
  process.exit(1);
}

console.error(`[check:syntax] ok (${files.length} files)`);
