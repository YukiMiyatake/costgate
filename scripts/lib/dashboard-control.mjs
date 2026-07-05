/**
 * Phase 24: dashboard write operations (tool overrides, mcp.json).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function toolOverridesPath() {
  return (
    process.env.COSTGATE_TOOL_OVERRIDES ??
    join(homedir(), ".costgate", "tool-overrides.json")
  );
}

export function mcpDisabledStorePath() {
  return (
    process.env.COSTGATE_MCP_DISABLED_PATH ??
    join(homedir(), ".costgate", "mcp-disabled.json")
  );
}

export function cursorMcpPath() {
  return process.env.CURSOR_MCP_PATH ?? join(homedir(), ".cursor", "mcp.json");
}

export function loadToolOverrides(path = toolOverridesPath()) {
  if (!existsSync(path)) {
    return { version: 1, tools: {} };
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    version: raw.version ?? 1,
    tools: raw.tools ?? {},
  };
}

export function saveToolOverrides(data, path = toolOverridesPath()) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    version: data.version ?? 1,
    tools: data.tools ?? {},
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function setToolForceTier(toolName, forceTier, path = toolOverridesPath()) {
  const data = loadToolOverrides(path);
  if (!forceTier || forceTier === "default") {
    delete data.tools[toolName];
  } else {
    data.tools[toolName] = { force_tier: forceTier };
  }
  saveToolOverrides(data, path);
  return data;
}

export function loadMcpJson(path = cursorMcpPath()) {
  if (!existsSync(path)) {
    throw new Error(`mcp.json not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadMcpDisabled(path = mcpDisabledStorePath()) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function saveMcpDisabled(store, path = mcpDisabledStorePath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/**
 * Enable or disable an MCP server in mcp.json.
 * Disabled configs are preserved in ~/.costgate/mcp-disabled.json.
 */
export function setMcpServerEnabled(name, enabled, paths = {}) {
  const mcpPath = paths.mcpPath ?? cursorMcpPath();
  const disabledPath = paths.disabledPath ?? mcpDisabledStorePath();
  const config = loadMcpJson(mcpPath);
  const disabled = loadMcpDisabled(disabledPath);
  config.mcpServers ??= {};

  const backup = `${mcpPath}.bak`;
  copyFileSync(mcpPath, backup);

  if (enabled) {
    if (disabled[name]) {
      config.mcpServers[name] = disabled[name];
      delete disabled[name];
    } else if (!config.mcpServers[name]) {
      throw new Error(`no stored config to enable MCP "${name}"`);
    }
  } else {
    if (config.mcpServers[name]) {
      disabled[name] = config.mcpServers[name];
      delete config.mcpServers[name];
    }
  }

  writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  saveMcpDisabled(disabled, disabledPath);

  return {
    backup,
    mcp_path: mcpPath,
    enabled,
    name,
    requires_cursor_restart: true,
    servers: Object.keys(config.mcpServers ?? {}),
  };
}

export function previewMcpDisable(name, paths = {}) {
  const mcpPath = paths.mcpPath ?? cursorMcpPath();
  const config = loadMcpJson(mcpPath);
  const current = config.mcpServers?.[name];
  if (!current) {
    return { name, enabled: false, preview: null };
  }
  const after = { ...config.mcpServers };
  delete after[name];
  return {
    name,
    enabled: true,
    preview: {
      before: { [name]: current },
      after: { mcpServers: after },
    },
    requires_cursor_restart: true,
  };
}
