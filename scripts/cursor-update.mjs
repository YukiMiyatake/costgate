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

function verifyGateOnHost() {
  try {
    execSync(`"${GATE_BIN}" --version`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    console.error(
      "[cursor:update] gate binary does not run on this machine (often glibc mismatch after Docker build)."
    );
    console.error("[cursor:update] rebuilding with CGO_ENABLED=0 for a portable binary...");
    if (useDocker) {
      docker([
        "bash",
        "-c",
        "cd packages/gate && CGO_ENABLED=0 go build -o bin/costgate-gate ./cmd/costgate-gate",
      ]);
    } else {
      run("cd packages/gate && CGO_ENABLED=0 go build -o bin/costgate-gate ./cmd/costgate-gate");
    }
    if (gateVersion() === "unknown") {
      console.error("[cursor:update] still failing — try: ./scripts/install-gate.sh");
      process.exit(1);
    }
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
    verifyGateOnHost();
  } else {
    run("npm run build:gate");
    run("npm run build:probe");
    run("node scripts/cursor-mcp.mjs production");
  }

  verifyGateOnHost();

  console.log("\nCostGate rebuilt (local).");
  console.log(`  Gate binary: ${GATE_BIN}`);
  console.log(`  Version:     ${gateVersion()}`);
  console.log(`  Mode:        ${useDocker ? "docker" : "host"}`);
  console.log("\nRestart Cursor MCP (Reload Window) to use the new binary.");
}

main();
