/**
 * Dashboard MCP CRUD — direct JSON add/edit/delete for backends.json and mcp.json.
 */
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import {
  cursorMcpPath,
  loadMcpDisabled,
  loadMcpJson,
  mcpDisabledStorePath,
  saveMcpDisabled,
} from "./dashboard-control.mjs";
import { loadBackendsJson, saveBackendsJson } from "./dashboard-marketplace.mjs";

export const PROTECTED_MCP_NAMES = new Set(["costgate-gate", "costgate-probe"]);

export function mcpControlPaths(paths = {}) {
  return {
    mcpPath: paths.mcpPath ?? cursorMcpPath(),
    disabledPath: paths.disabledPath ?? mcpDisabledStorePath(),
    configPath: paths.configPath,
    globalConfigPath: paths.globalConfigPath ?? paths.globalPaths?.configPath,
    scoped: Boolean(paths.scoped),
  };
}

function assertWritableName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new Error("name required");
  if (PROTECTED_MCP_NAMES.has(trimmed)) {
    throw new Error(`cannot modify protected MCP "${trimmed}"`);
  }
  return trimmed;
}

function normalizeName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new Error("name required");
  return trimmed;
}

function validateBackendConfig(cfg) {
  if (!cfg || typeof cfg !== "object") throw new Error("config object required");
  const hasUrl = Boolean(String(cfg.url ?? "").trim());
  const hasCmd = Boolean(String(cfg.command ?? "").trim());
  if (hasUrl && hasCmd) throw new Error("backend config cannot set both url and command");
  if (!hasUrl && !hasCmd) throw new Error("backend config requires url or command");
}

function validateDirectConfig(cfg) {
  if (!cfg || typeof cfg !== "object") throw new Error("config object required");
  if (!cfg.command && !cfg.url) throw new Error("direct MCP config requires command or url");
}

function sanitizeStoredConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  const out = { ...cfg };
  delete out._costgate_backend;
  return out;
}

const SECRET_ENV_KEY =
  /(?:token|secret|password|api[_-]?key|auth|credential|private|access[_-]?key)/i;

/** Mask env values for Dashboard GET responses (never expose secrets to the browser). */
export function maskSecretEnvValue(value) {
  if (value == null || value === "") return value;
  const s = String(value);
  if (s.length <= 4) return "••••";
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}

export function shouldMaskEnvKey(key) {
  return SECRET_ENV_KEY.test(String(key ?? ""));
}

export function maskMcpConfigForApi(config) {
  if (!config || typeof config !== "object") return config;
  const out = { ...config };
  if (out.env && typeof out.env === "object" && !Array.isArray(out.env)) {
    const masked = {};
    for (const [key, value] of Object.entries(out.env)) {
      masked[key] = shouldMaskEnvKey(key) ? maskSecretEnvValue(value) : value;
    }
    out.env = masked;
    out.env_values_masked = true;
  }
  return out;
}

function backupFile(path) {
  if (!existsSync(path)) return null;
  const backup = `${path}.bak`;
  copyFileSync(path, backup);
  return backup;
}

function backendFileForName(name, paths) {
  const localPath = paths.configPath;
  const globalPath = paths.globalConfigPath;
  if (localPath) {
    const local = loadBackendsJson(localPath).backends ?? {};
    if (local[name]) return { path: localPath, scope: paths.scoped ? "project" : "global" };
  }
  if (globalPath && globalPath !== localPath) {
    const global = loadBackendsJson(globalPath).backends ?? {};
    if (global[name]) return { path: globalPath, scope: "global" };
  }
  return null;
}

function resolveStorage(name, paths) {
  const mcpPath = paths.mcpPath;
  const disabledPath = paths.disabledPath;
  const mcp = loadMcpJson(mcpPath);
  const disabled = loadMcpDisabled(disabledPath);
  const backendLoc = backendFileForName(name, paths);

  if (Object.hasOwn(mcp.mcpServers ?? {}, name)) {
    return {
      storage: "direct",
      target: "direct",
      config_path: mcpPath,
      config: sanitizeStoredConfig(mcp.mcpServers[name]),
      enabled: true,
      editable: true,
      deletable: true,
    };
  }
  if (backendLoc) {
    const data = loadBackendsJson(backendLoc.path);
    return {
      storage: "backend",
      target: "backend",
      config_path: backendLoc.path,
      config_scope: backendLoc.scope,
      config: sanitizeStoredConfig(data.backends[name]),
      enabled: !Object.hasOwn(disabled, name),
      editable: true,
      deletable: true,
    };
  }
  if (Object.hasOwn(disabled, name)) {
    const stored = disabled[name];
    const isBackendMarker = stored?._costgate_backend === true;
    return {
      storage: isBackendMarker ? "backend" : "direct",
      target: isBackendMarker ? "backend" : "direct",
      config_path: disabledPath,
      config: sanitizeStoredConfig(stored),
      enabled: false,
      editable: true,
      deletable: true,
    };
  }
  return null;
}

export function getMcpServerDetail(name, paths = {}) {
  const resolved = mcpControlPaths(paths);
  const trimmed = normalizeName(name);
  const protectedMcp = PROTECTED_MCP_NAMES.has(trimmed);
  const detail = resolveStorage(trimmed, resolved);
  if (!detail) throw new Error(`unknown MCP server "${trimmed}"`);
  return {
    name: trimmed,
    ...detail,
    config: maskMcpConfigForApi(detail.config),
    editable: !protectedMcp && detail.editable,
    deletable: !protectedMcp && detail.deletable,
  };
}

export function addMcpServerRaw(body, paths = {}) {
  const resolved = mcpControlPaths(paths);
  const name = assertWritableName(body.name);
  const target = body.target === "direct" ? "direct" : "backend";
  const config = sanitizeStoredConfig(body.config);
  if (!config) throw new Error("config required");

  if (resolveStorage(name, resolved)) {
    throw new Error(`MCP "${name}" already exists`);
  }

  const backups = {};
  if (target === "backend") {
    validateBackendConfig(config);
    const configPath = resolved.configPath ?? resolved.globalConfigPath;
    if (!configPath) throw new Error("configPath required for backend install");
    const data = loadBackendsJson(configPath);
    backups.backends = backupFile(configPath);
    data.backends[name] = config;
    saveBackendsJson(data, configPath);
    return {
      ok: true,
      name,
      target,
      storage: "backend",
      config_path: configPath,
      requires_cursor_restart: false,
      requires_gate_reload: true,
      backups,
    };
  }

  validateDirectConfig(config);
  const mcp = loadMcpJson(resolved.mcpPath);
  backups.mcp = backupFile(resolved.mcpPath);
  mcp.mcpServers ??= {};
  mcp.mcpServers[name] = config;
  writeFileSync(resolved.mcpPath, `${JSON.stringify(mcp, null, 2)}\n`, "utf8");
  return {
    ok: true,
    name,
    target,
    storage: "direct",
    config_path: resolved.mcpPath,
    requires_cursor_restart: true,
    requires_gate_reload: false,
    backups,
  };
}

export function updateMcpServerConfig(name, body, paths = {}) {
  const resolved = mcpControlPaths(paths);
  const trimmed = assertWritableName(name);
  const config = sanitizeStoredConfig(body.config);
  if (!config) throw new Error("config required");

  const current = resolveStorage(trimmed, resolved);
  if (!current) throw new Error(`unknown MCP server "${trimmed}"`);

  const target = body.target ?? current.target;
  const backups = {};

  if (target === "backend") {
    validateBackendConfig(config);
    let configPath = current.storage === "backend" && current.config_path !== resolved.disabledPath
      ? current.config_path
      : null;
    if (!configPath) {
      configPath = resolved.configPath ?? resolved.globalConfigPath;
    }
    if (!configPath) throw new Error("configPath required for backend");
    const data = loadBackendsJson(configPath);
    backups.backends = backupFile(configPath);
    data.backends[trimmed] = config;
    saveBackendsJson(data, configPath);
    if (current.storage === "direct") {
      const mcp = loadMcpJson(resolved.mcpPath);
      if (mcp.mcpServers?.[trimmed]) {
        backups.mcp = backupFile(resolved.mcpPath);
        delete mcp.mcpServers[trimmed];
        writeFileSync(resolved.mcpPath, `${JSON.stringify(mcp, null, 2)}\n`, "utf8");
      }
    }
    const disabled = loadMcpDisabled(resolved.disabledPath);
    if (Object.hasOwn(disabled, trimmed)) {
      delete disabled[trimmed];
      saveMcpDisabled(disabled, resolved.disabledPath);
    }
    return {
      ok: true,
      name: trimmed,
      target: "backend",
      storage: "backend",
      config_path: configPath,
      requires_cursor_restart: Boolean(backups.mcp),
      requires_gate_reload: true,
      backups,
    };
  }

  validateDirectConfig(config);
  const mcp = loadMcpJson(resolved.mcpPath);
  backups.mcp = backupFile(resolved.mcpPath);
  mcp.mcpServers ??= {};
  mcp.mcpServers[trimmed] = config;
  writeFileSync(resolved.mcpPath, `${JSON.stringify(mcp, null, 2)}\n`, "utf8");

  if (current.storage === "backend" && current.config_path) {
    const data = loadBackendsJson(current.config_path);
    if (data.backends[trimmed]) {
      backups.backends = backupFile(current.config_path);
      delete data.backends[trimmed];
      saveBackendsJson(data, current.config_path);
    }
  }

  const disabled = loadMcpDisabled(resolved.disabledPath);
  if (Object.hasOwn(disabled, trimmed)) {
    delete disabled[trimmed];
    saveMcpDisabled(disabled, resolved.disabledPath);
  }

  return {
    ok: true,
    name: trimmed,
    target: "direct",
    storage: "direct",
    config_path: resolved.mcpPath,
    requires_cursor_restart: true,
    requires_gate_reload: Boolean(backups.backends),
    backups,
  };
}

export function deleteMcpServer(name, paths = {}) {
  const resolved = mcpControlPaths(paths);
  const trimmed = assertWritableName(name);
  const current = resolveStorage(trimmed, resolved);
  if (!current) throw new Error(`unknown MCP server "${trimmed}"`);

  const backups = {};
  let requires_cursor_restart = false;
  let requires_gate_reload = false;

  const mcp = loadMcpJson(resolved.mcpPath);
  if (mcp.mcpServers?.[trimmed]) {
    backups.mcp = backupFile(resolved.mcpPath);
    delete mcp.mcpServers[trimmed];
    writeFileSync(resolved.mcpPath, `${JSON.stringify(mcp, null, 2)}\n`, "utf8");
    requires_cursor_restart = true;
  }

  const backendLoc = backendFileForName(trimmed, resolved);
  if (backendLoc) {
    const data = loadBackendsJson(backendLoc.path);
    if (data.backends[trimmed]) {
      backups.backends = backupFile(backendLoc.path);
      delete data.backends[trimmed];
      saveBackendsJson(data, backendLoc.path);
      requires_gate_reload = true;
    }
  }

  const disabled = loadMcpDisabled(resolved.disabledPath);
  if (Object.hasOwn(disabled, trimmed)) {
    delete disabled[trimmed];
    saveMcpDisabled(disabled, resolved.disabledPath);
    requires_gate_reload = true;
  }

  return {
    ok: true,
    name: trimmed,
    deleted: true,
    requires_cursor_restart,
    requires_gate_reload,
    backups,
  };
}
