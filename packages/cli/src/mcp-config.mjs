/**
 * Write ~/.cursor/mcp.json production entry for @costgate/cli gate.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readCliPackageVersion } from "./cli-runtime.mjs";

export const DEFAULT_MCP_PATH = join(homedir(), ".cursor", "mcp.json");
export const DEFAULT_BACKENDS_PATH = join(homedir(), ".costgate", "backends.json");

export function gateMcpServer(cliVersion = readCliPackageVersion()) {
  return {
    command: "npx",
    args: ["-y", `@costgate/cli@${cliVersion}`, "gate"],
    env: {
      COSTGATE_PROJECT_ROOT: "${workspaceFolder}",
      COSTGATE_CONFIG: "${workspaceFolder}/.costgate/backends.json",
      COSTGATE_TOOL_OVERRIDES: "${workspaceFolder}/.costgate/tool-overrides.json",
      COSTGATE_USAGE_PATH: "${workspaceFolder}/.costgate/usage.json",
      COSTGATE_GATE_LOG_DIR: "${workspaceFolder}/.costgate/logs",
      COSTGATE_DASHBOARD_AUTO: "1",
      COSTGATE_DASHBOARD_AUTO_OPEN: "once",
      COSTGATE_CLIENT: "cursor",
      COSTGATE_GATE_MODE: "transparent",
      COSTGATE_COMPRESS: "1",
      COSTGATE_CODE_MODE: process.env.COSTGATE_CODE_MODE ?? "1",
      COSTGATE_COMPRESS_MAX_CHARS: process.env.COSTGATE_COMPRESS_MAX_CHARS ?? "12000",
      COSTGATE_CODE_MODE_MIN_CHARS: process.env.COSTGATE_CODE_MODE_MIN_CHARS ?? "2000",
      COSTGATE_INTENT_DYNAMIC: "1",
      COSTGATE_SHIELD: "1",
      COSTGATE_SHIELD_SESSION: "cursor",
    },
  };
}

export function loadMcpJson(mcpPath = DEFAULT_MCP_PATH) {
  if (!existsSync(mcpPath)) {
    return { mcpServers: {} };
  }
  return JSON.parse(readFileSync(mcpPath, "utf8"));
}

export function saveMcpJson(config, mcpPath = DEFAULT_MCP_PATH) {
  mkdirSync(join(mcpPath, ".."), { recursive: true });
  if (existsSync(mcpPath)) {
    copyFileSync(mcpPath, `${mcpPath}.bak`);
  }
  writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function applyProductionMcp(config, cliVersion) {
  config.mcpServers ??= {};
  delete config.mcpServers["costgate-probe"];
  config.mcpServers["costgate-gate"] = gateMcpServer(cliVersion);
  return config;
}

export function ensureBackendsTemplate(runtimeRoot, backendsPath = DEFAULT_BACKENDS_PATH) {
  if (existsSync(backendsPath)) {
    return { path: backendsPath, created: false };
  }
  const template = join(runtimeRoot, "examples", "backends.github.json");
  if (!existsSync(template)) {
    throw new Error(`backends template missing: ${template}`);
  }
  mkdirSync(join(backendsPath, ".."), { recursive: true });
  copyFileSync(template, backendsPath);
  return { path: backendsPath, created: true };
}
