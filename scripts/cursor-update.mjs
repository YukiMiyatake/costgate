#!/usr/bin/env node
/**
 * Pull latest main, rebuild Gate (and Probe), refresh Cursor production config.
 *
 * Usage:
 *   npm run cursor:update
 *   npm run cursor:update -- --no-pull   # build only
 */
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const noPull = args.includes("--no-pull");
const GATE_BIN = join(ROOT, "packages/gate/bin/costgate-gate");

function run(cmd, opts = {}) {
  console.error(`[cursor:update] ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

function gateVersion() {
  try {
    const mainGo = join(ROOT, "packages/gate/cmd/costgate-gate/main.go");
    const src = execSync(`grep costgate-gate "${mainGo}"`, { encoding: "utf8" });
    const m = src.match(/costgate-gate\] (v[\d.]+)/);
    return m?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

function main() {
  if (!noPull) {
    run("git fetch origin main");
    run("git pull origin main");
  }

  run("npm run build:gate");
  run("npm run build:probe");
  run("node scripts/cursor-mcp.mjs production");

  console.log("\nCostGate updated.");
  console.log(`  Gate binary: ${GATE_BIN}`);
  console.log(`  Version:     ${gateVersion()}`);
  console.log("\nRestart Cursor MCP (Reload Window) to use the new binary.");
}

main();
