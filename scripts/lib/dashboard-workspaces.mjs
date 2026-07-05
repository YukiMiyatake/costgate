/**
 * Phase 28: workspace registry + scoped CostGate paths per project root.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { resolveProjectRoot } from "./dashboard-project-recommend.mjs";

export function registryPath() {
  return (
    process.env.COSTGATE_WORKSPACE_REGISTRY ??
    join(homedir(), ".costgate", "workspace-registry.json")
  );
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function loadRegistry(path = registryPath()) {
  const raw = readJson(path);
  return {
    version: raw?.version ?? 1,
    workspaces: raw?.workspaces ?? [],
  };
}

export function saveRegistry(data, path = registryPath()) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    version: data.version ?? 1,
    workspaces: data.workspaces ?? [],
  };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  return payload;
}

/** URL-safe workspace id (path → base64url). */
export function encodeWorkspaceId(absPath) {
  return Buffer.from(resolve(absPath), "utf8")
    .toString("base64url")
    .replace(/=+$/g, "");
}

export function decodeWorkspaceId(id) {
  if (!id) return null;
  try {
    return resolve(Buffer.from(id, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function hasWorkspaceConfig(absPath) {
  return existsSync(join(absPath, ".costgate", "backends.json"));
}

function entryFromPath(absPath, extra = {}) {
  const path = resolve(absPath);
  return {
    path,
    label: basename(path),
    last_seen: extra.last_seen ?? new Date().toISOString(),
    has_config: hasWorkspaceConfig(path),
    pinned: Boolean(extra.pinned),
  };
}

export function touchRegistryPath(absPath, path = registryPath()) {
  const abs = resolve(absPath);
  const reg = loadRegistry(path);
  const now = new Date().toISOString();
  let found = false;
  for (const w of reg.workspaces) {
    if (resolve(w.path) === abs) {
      w.last_seen = now;
      w.label = basename(abs);
      w.has_config = hasWorkspaceConfig(abs);
      found = true;
      break;
    }
  }
  if (!found) {
    reg.workspaces.push(entryFromPath(abs, { last_seen: now }));
  }
  saveRegistry(reg, path);
  return reg;
}

export function pinWorkspace(absPath, path = registryPath()) {
  const abs = resolve(absPath);
  if (!existsSync(abs)) {
    throw new Error(`workspace path not found: ${abs}`);
  }
  const reg = loadRegistry(path);
  let found = false;
  for (const w of reg.workspaces) {
    if (resolve(w.path) === abs) {
      w.pinned = true;
      w.last_seen = new Date().toISOString();
      w.has_config = hasWorkspaceConfig(abs);
      found = true;
      break;
    }
  }
  if (!found) {
    reg.workspaces.push(entryFromPath(abs, { pinned: true }));
  }
  saveRegistry(reg, path);
  return listWorkspaces({ registryPath: path, includeCurrent: false });
}

/** CostGate paths scoped to a workspace root. */
export function workspaceScopedPaths(workspaceRoot, globalFallback = {}) {
  const root = resolve(workspaceRoot);
  const costgateDir = join(root, ".costgate");
  return {
    projectRoot: root,
    configPath: join(costgateDir, "backends.json"),
    overridesPath: join(costgateDir, "tool-overrides.json"),
    disabledPath: join(costgateDir, "mcp-disabled.json"),
    usagePath: join(costgateDir, "usage.json"),
    logDir: join(costgateDir, "logs"),
    gateLogDir: join(costgateDir, "logs"),
    mcpPath: existsSync(join(root, ".cursor", "mcp.json"))
      ? join(root, ".cursor", "mcp.json")
      : globalFallback.mcpPath,
    scoped: true,
  };
}

export function listWorkspaces(options = {}) {
  const regPath = options.registryPath ?? registryPath();
  const reg = loadRegistry(regPath);
  const seen = new Set();
  const items = [];

  const add = (entry) => {
    const path = resolve(entry.path);
    if (seen.has(path)) return;
    seen.add(path);
    items.push({
      id: encodeWorkspaceId(path),
      path,
      label: entry.label ?? basename(path),
      last_seen: entry.last_seen ?? null,
      has_config: entry.has_config ?? hasWorkspaceConfig(path),
      pinned: Boolean(entry.pinned),
    });
  };

  for (const w of reg.workspaces) {
    add(w);
  }

  if (options.includeCurrent !== false) {
    const current = resolveProjectRoot(options);
    if (current && existsSync(current)) {
      add(entryFromPath(current));
    }
  }

  items.sort((a, b) => {
    const pin = Number(b.pinned) - Number(a.pinned);
    if (pin !== 0) return pin;
    const ta = a.last_seen ? Date.parse(a.last_seen) : 0;
    const tb = b.last_seen ? Date.parse(b.last_seen) : 0;
    return tb - ta || a.label.localeCompare(b.label);
  });

  return {
    registry_path: regPath,
    workspaces: items,
    active_id: options.activeId ?? null,
  };
}

export function resolveWorkspace(id, options = {}) {
  const path = decodeWorkspaceId(id);
  if (!path || !existsSync(path)) {
    throw new Error(`unknown workspace: ${id}`);
  }
  return {
    id,
    ...workspaceScopedPaths(path, options.globalFallback ?? {}),
  };
}
