/**
 * Phase 28: workspace registry + scoped CostGate paths per project root.
 */
import {
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { resolveProjectRoot } from "./dashboard-project-recommend.mjs";
import { readJson } from "./read-json.mjs";

/** How a workspace entered the Activity Registry. */
export const REGISTRY_SOURCES = {
  gate: { id: "gate", label: "Gate" },
  "cursor:workspace": { id: "cursor:workspace", label: "Cursor folder" },
  "cursor:file": { id: "cursor:file", label: "Cursor file" },
  pin: { id: "pin", label: "Pinned" },
  dashboard: { id: "dashboard", label: "Dashboard" },
};

export function registrySourceLabel(source) {
  return REGISTRY_SOURCES[source]?.label ?? source ?? "Unknown";
}

export function registryPath() {
  return (
    process.env.COSTGATE_WORKSPACE_REGISTRY ??
    join(homedir(), ".costgate", "workspace-registry.json")
  );
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
    source: extra.source ?? null,
  };
}

/**
 * Record or update a workspace in the registry.
 * @param {string} absPath
 * @param {{ registryPath?: string, source?: string, pinned?: boolean }} [options]
 */
export function touchRegistryPath(absPath, options = {}) {
  const regPath = options.registryPath ?? registryPath();
  const abs = resolve(absPath);
  const reg = loadRegistry(regPath);
  const now = new Date().toISOString();
  const source = options.source ?? null;
  let found = false;
  for (const w of reg.workspaces) {
    if (resolve(w.path) === abs) {
      w.last_seen = now;
      w.label = basename(abs);
      w.has_config = hasWorkspaceConfig(abs);
      if (options.pinned) w.pinned = true;
      if (source) w.source = source;
      found = true;
      break;
    }
  }
  if (!found) {
    reg.workspaces.push(
      entryFromPath(abs, {
        last_seen: now,
        pinned: options.pinned,
        source,
      })
    );
  }
  saveRegistry(reg, regPath);
  return reg;
}

export function pinWorkspace(absPath, path = registryPath()) {
  const abs = resolve(absPath);
  if (!existsSync(abs)) {
    throw new Error(`workspace path not found: ${abs}`);
  }
  touchRegistryPath(abs, { registryPath: path, source: "pin", pinned: true });
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
    gateSettingsPath: join(costgateDir, "gate-settings.json"),
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

  const add = (entry, ephemeralSource = null) => {
    const path = resolve(entry.path);
    if (!existsSync(path)) return;
    if (seen.has(path)) return;
    seen.add(path);
    const source = ephemeralSource ?? entry.source ?? null;
    items.push({
      id: encodeWorkspaceId(path),
      path,
      label: entry.label ?? basename(path),
      last_seen: entry.last_seen ?? null,
      has_config: entry.has_config ?? hasWorkspaceConfig(path),
      pinned: Boolean(entry.pinned),
      source,
      source_label: source ? registrySourceLabel(source) : null,
    });
  };

  for (const w of reg.workspaces) {
    add(w);
  }

  if (options.includeCurrent !== false) {
    const current = resolveProjectRoot(options);
    if (current && existsSync(current)) {
      const inReg = reg.workspaces.some((w) => resolve(w.path) === resolve(current));
      if (!inReg) {
        add(entryFromPath(current), "dashboard");
      }
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
    help:
      "Projects appear when Gate runs, Cursor opens a folder (hook), Agent/Tab reads a file, or you Pin a path.",
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
