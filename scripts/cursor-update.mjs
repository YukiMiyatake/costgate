#!/usr/bin/env node
/**
 * Rebuild Gate (and Probe) from local sources, refresh Cursor production config.
 *
 * Usage:
 *   npm run cursor:update
 *   npm run cursor:update -- --docker   # no host Node/Go (Docker only)
 */
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const useDocker = args.includes("--docker");
const GATE_BIN = join(ROOT, "packages/gate/bin/costgate-gate");

function run(cmd, opts = {}) {
  console.error(`[cursor:update] ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

function gateVersion() {
  try {
    return execSync(`"${GATE_BIN}" --version`, { encoding: "utf8", cwd: ROOT }).trim();
  } catch {
    return "unknown";
  }
}

function docker(argv) {
  console.error(`[cursor:update] docker ${argv.join(" ")}`);
  const r = spawnSync("node", ["scripts/docker-run.mjs", ...argv], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function main() {
  if (useDocker) {
    docker(["npm", "run", "build"]);
    docker(["npm", "run", "build:gate"]);
    docker(["node", "scripts/cursor-mcp.mjs", "production"]);
  } else {
    run("npm run build:gate");
    run("npm run build:probe");
    run("node scripts/cursor-mcp.mjs production");
  }

  console.log("\nCostGate rebuilt (local).");
  console.log(`  Gate binary: ${GATE_BIN}`);
  console.log(`  Version:     ${gateVersion()}`);
  console.log(`  Mode:        ${useDocker ? "docker" : "host"}`);
  console.log("\nRestart Cursor MCP (Reload Window) to use the new binary.");
}

main();
