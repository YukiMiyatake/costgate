#!/usr/bin/env node
/**
 * Gate MCP launcher: optional Dashboard sidecar + exec costgate-gate.
 *
 * Cursor mcp.json uses this instead of calling the Go binary directly so
 * Dashboard can start when Gate connects (Serena-style UX).
 *
 * Disable: COSTGATE_DASHBOARD_AUTO=0
 * Skip browser: COSTGATE_DASHBOARD_AUTO_OPEN=0
 */
import { spawn } from "node:child_process";
import { ensureDashboard } from "./lib/dashboard-launcher.mjs";
import { gateBin } from "./lib/paths.mjs";

function logDashboard(result) {
  if (result.skipped === "auto_disabled") return;
  if (result.started && result.running) {
    process.stderr.write(
      `[costgate] dashboard started ${result.url}${result.opened ? " (browser opened)" : ""}\n`
    );
    return;
  }
  if (result.running) {
    process.stderr.write(`[costgate] dashboard already running ${result.url}\n`);
    return;
  }
  if (result.started && !result.running) {
    process.stderr.write(`[costgate] dashboard failed to become ready ${result.url}\n`);
  }
}

ensureDashboard({ env: process.env })
  .then(logDashboard)
  .catch((err) => {
    process.stderr.write(`[costgate] dashboard: ${err.message ?? err}\n`);
  });

const bin = process.env.COSTGATE_GATE_BIN ?? gateBin();
const child = spawn(bin, [], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (err) => {
  process.stderr.write(`[costgate-gate-launch] ${err.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
