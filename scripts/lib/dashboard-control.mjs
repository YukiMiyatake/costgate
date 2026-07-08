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
import { createHash } from "node:crypto";
import { qualifyOverrideToolName } from "./tool-override-names.mjs";
import { readJson } from "./read-json.mjs";

function overrideKey(toolName, backend = null) {
  return qualifyOverrideToolName(toolName, backend);
}

function normalizeBulkHideEntries(entries) {
  const out = [];
  for (const entry of entries ?? []) {
    if (typeof entry === "string" && entry) out.push({ name: entry, backend: null });
    else if (entry?.name) out.push({ name: entry.name, backend: entry.backend ?? null });
  }
  return out;
}

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

export function toolOverridesGeneration(data) {
  const tools = data?.tools ?? {};
  const keys = Object.keys(tools).sort();
  if (keys.length === 0) {
    return createHash("sha256").update("empty").digest("hex").slice(0, 16);
  }
  const payload = keys
    .map((key) => {
      const ov = tools[key] ?? {};
      return `${key}|${ov.force_tier ?? ""}|${!!ov.always_expose}|${!!ov.exclude_lock}`;
    })
    .join("");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Resolve override fields for API responses after a qualified write. */
export function toolOverrideResponseFields(toolName, backend, data) {
  const key = overrideKey(toolName, backend);
  const ov = data.tools[key] ?? data.tools[toolName] ?? {};
  return {
    storage_key: key,
    force_tier: ov.force_tier ?? null,
    exclude_lock: Boolean(ov.exclude_lock),
    always_expose: Boolean(ov.always_expose),
  };
}

export function loadToolOverrides(path = toolOverridesPath()) {
  if (!existsSync(path)) {
    return { version: 1, tools: {} };
  }
  const raw = readJson(path);
  if (!raw) {
    return { version: 1, tools: {}, corrupt: true };
  }
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

export function setToolForceTier(toolName, forceTier, path = toolOverridesPath(), backend = null) {
  const data = loadToolOverrides(path);
  const key = overrideKey(toolName, backend);
  const cur = { ...(data.tools[key] ?? {}) };
  if (!forceTier || forceTier === "default") {
    delete cur.force_tier;
  } else {
    cur.force_tier = forceTier;
  }
  if (Object.keys(cur).length === 0) {
    delete data.tools[key];
  } else {
    data.tools[key] = cur;
  }
  saveToolOverrides(data, path);
  return data;
}

/** Prevent bulk-exclude recommendations from targeting this tool. */
export function setToolExcludeLock(toolName, locked, path = toolOverridesPath(), backend = null) {
  const data = loadToolOverrides(path);
  const key = overrideKey(toolName, backend);
  const cur = { ...(data.tools[key] ?? {}) };
  if (locked) {
    cur.exclude_lock = true;
    data.tools[key] = cur;
  } else {
    delete cur.exclude_lock;
    if (Object.keys(cur).length === 0) {
      delete data.tools[key];
    } else {
      data.tools[key] = cur;
    }
  }
  saveToolOverrides(data, path);
  return data;
}

/** Pin tool to tools/list (Tier A) without changing other override fields. */
export function setToolAlwaysExpose(toolName, pinned, path = toolOverridesPath(), backend = null) {
  const data = loadToolOverrides(path);
  const key = overrideKey(toolName, backend);
  const cur = { ...(data.tools[key] ?? {}) };
  if (pinned) {
    cur.always_expose = true;
    data.tools[key] = cur;
  } else {
    delete cur.always_expose;
    if (Object.keys(cur).length === 0) {
      delete data.tools[key];
    } else {
      data.tools[key] = cur;
    }
  }
  saveToolOverrides(data, path);
  return data;
}

/** PATCH body may set force_tier and/or exclude_lock without clobbering other fields. */
export function patchToolOverride(toolName, body, path = toolOverridesPath()) {
  const backend = body.backend ?? null;
  const hasForce =
    body.force_tier !== undefined ||
    body.enabled === true ||
    body.enabled === false;
  const hasLock = typeof body.exclude_lock === "boolean";
  const hasPin = typeof body.always_expose === "boolean";
  if (!hasForce && !hasLock && !hasPin) {
    throw new Error("force_tier, enabled, exclude_lock, or always_expose required");
  }
  let data = loadToolOverrides(path);
  if (hasForce) {
    const forceTier =
      body.force_tier ??
      (body.enabled === false ? "hidden" : body.enabled === true ? "default" : null);
    data = setToolForceTier(toolName, forceTier, path, backend);
  }
  if (hasLock) {
    data = setToolExcludeLock(toolName, body.exclude_lock, path, backend);
  }
  if (hasPin) {
    data = setToolAlwaysExpose(toolName, body.always_expose, path, backend);
  }
  return data;
}

/** Hide multiple tools from tools/list (force_tier: hidden). */
export function bulkHideTools(entries, path = toolOverridesPath()) {
  const normalized = normalizeBulkHideEntries(entries);
  const data = loadToolOverrides(path);
  const hidden = [];
  const skipped = [];
  for (const { name, backend } of normalized) {
    const key = overrideKey(name, backend);
    const cur = data.tools[key] ?? data.tools[name] ?? {};
    if (cur.exclude_lock || cur.always_expose) {
      skipped.push(key);
      continue;
    }
    data.tools[key] = { ...cur, force_tier: "hidden" };
    hidden.push(key);
  }
  saveToolOverrides(data, path);
  return { overrides: data, hidden, skipped, count: hidden.length };
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

const GATE_MCP_NAMES = new Set(["costgate-gate", "costgate-probe"]);

function loadBackendsMap(configPath) {
  if (!configPath || !existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    return raw.backends ?? raw;
  } catch {
    return {};
  }
}

function resolveBackendsForServer(paths = {}) {
  const global = loadBackendsMap(paths.globalConfigPath);
  const local = loadBackendsMap(paths.configPath);
  return { ...global, ...local };
}

function backendDisabledMarker(backendCfg) {
  const marker = { _costgate_backend: true };
  if (backendCfg?.command) marker.command = backendCfg.command;
  if (backendCfg?.url) marker.url = backendCfg.url;
  if (backendCfg?.args) marker.args = backendCfg.args;
  return marker;
}

function isMcpServerConfig(cfg) {
  return Boolean(cfg && (cfg.command || cfg.url));
}

export function saveMcpDisabled(store, path = mcpDisabledStorePath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/**
 * Enable or disable an MCP server.
 * Direct MCPs: mcp.json + mcp-disabled.json.
 * Gate backends (backends.json only): mcp-disabled.json only — mcp.json is not modified.
 */
export function setMcpServerEnabled(name, enabled, paths = {}) {
  if (GATE_MCP_NAMES.has(name)) {
    throw new Error(`cannot enable/disable Gate MCP "${name}" from dashboard`);
  }

  const mcpPath = paths.mcpPath ?? cursorMcpPath();
  const disabledPath = paths.disabledPath ?? mcpDisabledStorePath();
  const backends = resolveBackendsForServer(paths);
  const config = loadMcpJson(mcpPath);
  const disabled = loadMcpDisabled(disabledPath);
  config.mcpServers ??= {};

  const inMcp = Object.hasOwn(config.mcpServers, name);
  const inBackends = Object.hasOwn(backends, name);
  const inDisabled = Object.hasOwn(disabled, name);

  if (!inMcp && !inBackends && !inDisabled) {
    throw new Error(`unknown MCP server "${name}"`);
  }

  const updated = { mcp_json: false, mcp_disabled: false };
  const backup = `${mcpPath}.bak`;
  let mcpBackupCreated = false;

  if (enabled) {
    if (inDisabled) {
      const stored = disabled[name];
      delete disabled[name];
      updated.mcp_disabled = true;
      if (isMcpServerConfig(stored)) {
        copyFileSync(mcpPath, backup);
        mcpBackupCreated = true;
        config.mcpServers[name] = stored;
        updated.mcp_json = true;
      }
    } else if (!inMcp && !inBackends) {
      throw new Error(`no stored config to enable MCP "${name}"`);
    }
  } else if (inMcp) {
    copyFileSync(mcpPath, backup);
    mcpBackupCreated = true;
    disabled[name] = config.mcpServers[name];
    delete config.mcpServers[name];
    updated.mcp_json = true;
    updated.mcp_disabled = true;
  } else if (inBackends) {
    disabled[name] = backendDisabledMarker(backends[name]);
    updated.mcp_disabled = true;
  } else {
    throw new Error(`MCP "${name}" is already disabled`);
  }

  if (updated.mcp_json) {
    writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
  if (updated.mcp_disabled) {
    saveMcpDisabled(disabled, disabledPath);
  }

  const role = inBackends && !inMcp ? "backend" : "direct";

  return {
    backup: mcpBackupCreated ? backup : null,
    mcp_path: mcpPath,
    disabled_path: disabledPath,
    enabled,
    name,
    role,
    updated,
    requires_cursor_restart: updated.mcp_json,
    requires_gate_reload: updated.mcp_disabled && (inBackends || role === "backend"),
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
