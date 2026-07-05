#!/usr/bin/env node
/**
 * Switch ~/.cursor/mcp.json between production (Gate) and measurement (Probe).
 *
 * Usage:
 *   npm run cursor:production   # costgate-gate (+ keep other servers)
 *   npm run cursor:measurement  # costgate-probe
 *   npm run cursor:mcp -- status
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOST_ROOT = process.env.COSTGATE_HOST_ROOT ?? ROOT;
const MCP_PATH = process.env.CURSOR_MCP_PATH ?? join(homedir(), ".cursor/mcp.json");
const BACKENDS_LOCAL =
  process.env.COSTGATE_CONFIG ?? join(homedir(), ".costgate/backends.json");
const BACKENDS_MCP = process.env.COSTGATE_HOST_CONFIG ?? BACKENDS_LOCAL;
const GATE_BIN_LOCAL =
  process.env.COSTGATE_GATE_BIN ?? join(ROOT, "packages/gate/bin/costgate-gate");
const GATE_BIN_MCP = join(HOST_ROOT, "packages/gate/bin/costgate-gate");
const PROBE_JS_LOCAL = join(ROOT, "packages/probe/dist/index.js");
const PROBE_JS_MCP = join(HOST_ROOT, "packages/probe/dist/index.js");
const LOG_DIR_LOCAL =
  process.env.COSTGATE_PROBE_LOG_DIR ?? join(homedir(), ".costgate/logs");
const LOG_DIR_MCP = process.env.COSTGATE_HOST_PROBE_LOG_DIR ?? LOG_DIR_LOCAL;

const mode = process.argv[2] ?? "status";

function loadMcp() {
  if (!existsSync(MCP_PATH)) {
    throw new Error(`mcp.json not found: ${MCP_PATH}`);
  }
  return JSON.parse(readFileSync(MCP_PATH, "utf8"));
}

function saveMcp(config) {
  const backup = `${MCP_PATH}.bak`;
  copyFileSync(MCP_PATH, backup);
  writeFileSync(MCP_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.error(`[cursor-mcp] backup: ${backup}`);
  console.error(`[cursor-mcp] wrote: ${MCP_PATH}`);
}

function gateServer() {
  return {
    command: GATE_BIN_MCP,
    env: {
      COSTGATE_PROJECT_ROOT: "${workspaceFolder}",
      COSTGATE_CONFIG: "${workspaceFolder}/.costgate/backends.json",
      COSTGATE_TOOL_OVERRIDES: "${workspaceFolder}/.costgate/tool-overrides.json",
      COSTGATE_USAGE_PATH: "${workspaceFolder}/.costgate/usage.json",
      COSTGATE_GATE_LOG_DIR: "${workspaceFolder}/.costgate/logs",
      COSTGATE_CLIENT: "cursor",
      // Token reduction — filter + compress + code-mode (see docs/benchmarks.md)
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_COMPRESS: "1",
      COSTGATE_CODE_MODE: process.env.COSTGATE_CODE_MODE ?? "1",
      COSTGATE_COMPRESS_MAX_CHARS: process.env.COSTGATE_COMPRESS_MAX_CHARS ?? "12000",
      COSTGATE_CODE_MODE_MIN_CHARS: process.env.COSTGATE_CODE_MODE_MIN_CHARS ?? "2000",
      COSTGATE_INTENT_DYNAMIC: "1",
    },
  };
}

function probeServer() {
  return {
    command: "node",
    args: [PROBE_JS_MCP],
    env: {
      COSTGATE_CONFIG: BACKENDS_MCP,
      COSTGATE_PROBE_LOG_DIR: LOG_DIR_MCP,
      COSTGATE_CLIENT: "cursor",
    },
  };
}

function applyProduction(config) {
  if (!existsSync(GATE_BIN_LOCAL)) {
    throw new Error(`gate binary missing: ${GATE_BIN_LOCAL}\nRun: npm run build:gate`);
  }
  if (!existsSync(BACKENDS_LOCAL)) {
    throw new Error(`backends config missing: ${BACKENDS_LOCAL}\nCopy examples/backends.github.json`);
  }
  config.mcpServers ??= {};
  delete config.mcpServers["costgate-probe"];
  config.mcpServers["costgate-gate"] = gateServer();
  return config;
}

function applyMeasurement(config) {
  if (!existsSync(PROBE_JS_LOCAL)) {
    throw new Error(`probe not built: ${PROBE_JS_LOCAL}\nRun: npm run build:probe`);
  }
  config.mcpServers ??= {};
  delete config.mcpServers["costgate-gate"];
  config.mcpServers["costgate-probe"] = probeServer();
  return config;
}

function status(config) {
  const servers = Object.keys(config.mcpServers ?? {});
  const hasGate = "costgate-gate" in (config.mcpServers ?? {});
  const hasProbe = "costgate-probe" in (config.mcpServers ?? {});
  let active = "unknown";
  if (hasGate && !hasProbe) active = "production (gate)";
  else if (hasProbe && !hasGate) active = "measurement (probe)";
  else if (hasGate && hasProbe) active = "both gate and probe (not recommended)";
  else active = "neither gate nor probe";

  console.log(`mcp.json: ${MCP_PATH}`);
  console.log(`mode:     ${active}`);
  console.log(`servers:  ${servers.join(", ")}`);
}

function main() {
  switch (mode) {
    case "production":
    case "gate": {
      const config = applyProduction(loadMcp());
      saveMcp(config);
      console.log("Switched to production: costgate-gate (GitHub filtered).");
      console.log("Restart Cursor MCP or reload the window.");
      break;
    }
    case "measurement":
    case "probe": {
      const config = applyMeasurement(loadMcp());
      saveMcp(config);
      console.log("Switched to measurement: costgate-probe (JSONL logs).");
      console.log("Restart Cursor MCP or reload the window.");
      break;
    }
    case "status": {
      status(loadMcp());
      break;
    }
    default:
      console.error(`Unknown mode: ${mode}`);
      console.error("Usage: cursor-mcp.mjs [production|measurement|status]");
      process.exit(1);
  }
}

main();
