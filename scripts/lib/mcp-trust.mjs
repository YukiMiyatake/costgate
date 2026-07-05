/**
 * Phase 31a: MCP trust levels — load/merge/resolve for Dashboard (read-only).
 * Global: ~/.costgate/mcp-trust.json
 * Project: <root>/.costgate/mcp-trust.json (overrides Global when scoped)
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mergeNamedRecords } from "./dashboard-config-merge.mjs";
import { loadMarketplaceCatalog } from "./dashboard-marketplace.mjs";
import { readJson } from "./read-json.mjs";

export const MCP_TRUST_VERSION = 1;

export const MCP_TRUST_LEVELS = ["trusted", "standard", "restricted", "untrusted"];

/** Disabled MCPs use a separate store; trust display shows disabled above untrusted. */
export const MCP_TRUST_DISPLAY_LEVELS = [...MCP_TRUST_LEVELS, "disabled"];

export const DEFAULT_MCP_TRUST = {
  version: MCP_TRUST_VERSION,
  defaults: {
    gate_backend: "standard",
    direct_mcp: "restricted",
    unknown: "restricted",
  },
  servers: {
    "costgate-gate": { trust: "trusted", source: "builtin" },
    "costgate-probe": { trust: "trusted", source: "builtin" },
  },
};

export function globalMcpTrustPath() {
  return process.env.COSTGATE_TRUST_PATH ?? join(homedir(), ".costgate", "mcp-trust.json");
}

export function projectMcpTrustPath(projectRoot) {
  return join(projectRoot, ".costgate", "mcp-trust.json");
}

function normalizeServerEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!MCP_TRUST_LEVELS.includes(raw.trust)) return null;
  const out = { trust: raw.trust };
  if (typeof raw.source === "string") out.source = raw.source;
  if (typeof raw.backend_key === "string") out.backend_key = raw.backend_key;
  return out;
}

export function normalizeTrustConfig(raw = {}) {
  const out = {
    version: MCP_TRUST_VERSION,
    defaults: { ...DEFAULT_MCP_TRUST.defaults },
    servers: { ...DEFAULT_MCP_TRUST.servers },
  };
  if (raw.defaults && typeof raw.defaults === "object") {
    for (const key of Object.keys(out.defaults)) {
      if (MCP_TRUST_LEVELS.includes(raw.defaults[key])) {
        out.defaults[key] = raw.defaults[key];
      }
    }
  }
  if (raw.servers && typeof raw.servers === "object") {
    for (const [name, entry] of Object.entries(raw.servers)) {
      const norm = normalizeServerEntry(entry);
      if (norm) out.servers[name] = norm;
    }
  }
  return out;
}

export function loadMcpTrustFile(path) {
  const raw = readJson(path);
  if (!raw) return null;
  return normalizeTrustConfig(raw);
}

export function loadMcpTrust(paths = {}) {
  const globalPath = paths.globalPath ?? globalMcpTrustPath();
  const projectPath =
    paths.projectPath ?? (paths.projectRoot ? projectMcpTrustPath(paths.projectRoot) : null);
  const global = loadMcpTrustFile(globalPath) ?? normalizeTrustConfig();

  if (!projectPath || !existsSync(projectPath)) {
    return {
      config: global,
      paths: { global: globalPath, project: projectPath, effective: globalPath },
      origins: { defaults: {}, servers: {} },
      config_merge: false,
    };
  }

  const project = loadMcpTrustFile(projectPath) ?? normalizeTrustConfig({});
  const defaults = { ...global.defaults, ...project.defaults };
  const defaultOrigins = {};
  for (const key of Object.keys(defaults)) {
    if (project.defaults?.[key] !== undefined && project.defaults[key] !== global.defaults[key]) {
      defaultOrigins[key] = "project";
    } else if (global.defaults?.[key] !== undefined) {
      defaultOrigins[key] = existsSync(globalPath) ? "global" : "default";
    } else {
      defaultOrigins[key] = "default";
    }
  }

  const { merged: servers, origins: serverOrigins } = mergeNamedRecords(
    global.servers,
    project.servers
  );

  return {
    config: { version: MCP_TRUST_VERSION, defaults, servers },
    paths: { global: globalPath, project: projectPath, effective: projectPath },
    origins: { defaults: defaultOrigins, servers: serverOrigins },
    config_merge: true,
  };
}

/** Index marketplace templates by id and backend_key for trust resolution. */
export function indexMarketplaceCatalog(catalog = []) {
  const byKey = new Map();
  for (const t of catalog) {
    if (t.id) byKey.set(t.id, t);
    if (t.backend_key && !byKey.has(t.backend_key)) byKey.set(t.backend_key, t);
  }
  return byKey;
}

function marketplaceTemplateForName(name, catalogIndex) {
  return catalogIndex?.get(name) ?? null;
}

function defaultKeyForServer(meta = {}) {
  if (meta.role === "gate" || meta.role === "probe" || meta.role === "backend") {
    return "gate_backend";
  }
  if (meta.role === "direct" || meta.source === "mcp.json") {
    return "direct_mcp";
  }
  return "unknown";
}

/**
 * Resolve effective trust for one MCP server.
 * Order: disabled → servers[name] → marketplace official → defaults → restricted
 */
export function resolveServerTrust(name, context = {}) {
  const { config, origins } = context.trust ?? loadMcpTrust(context.paths ?? {});
  const meta = context.meta ?? {};
  const catalogIndex =
    context.catalogIndex ??
    indexMarketplaceCatalog(
      context.marketplaceCatalog ?? loadMarketplaceCatalog(context.marketplaceDir)
    );

  if (meta.enabled === false) {
    return {
      trust: "disabled",
      source: "mcp-disabled.json",
      resolved_from: "disabled",
      origin: null,
    };
  }

  const entry = config.servers[name];
  if (entry) {
    return {
      trust: entry.trust,
      source: entry.source ?? "config",
      resolved_from: "servers",
      origin: origins.servers?.[name] ?? (entry.source === "builtin" ? "builtin" : "config"),
    };
  }

  const template = marketplaceTemplateForName(name, catalogIndex);
  if (template?.official) {
    return {
      trust: "standard",
      source: "marketplace",
      resolved_from: "marketplace_official",
      origin: "marketplace",
    };
  }

  const defaultKey = defaultKeyForServer(meta);
  const trust = config.defaults[defaultKey] ?? "restricted";
  return {
    trust,
    source: "default",
    resolved_from: defaultKey,
    origin: "default",
  };
}

/** Attach trust fields to dashboard MCP rows. */
export function enrichMcpsWithTrust(servers, context = {}) {
  const trustCtx = context.trust ?? loadMcpTrust(context.paths ?? {});
  const catalogIndex =
    context.catalogIndex ??
    indexMarketplaceCatalog(
      context.marketplaceCatalog ?? loadMarketplaceCatalog(context.marketplaceDir)
    );

  const enriched = servers.map((s) => {
    const resolved = resolveServerTrust(s.name, {
      trust: trustCtx,
      meta: s,
      catalogIndex,
    });
    return { ...s, ...resolved };
  });

  const restrictedOrBelow = enriched.filter(
    (s) => s.trust === "restricted" || s.trust === "untrusted"
  ).length;

  return {
    servers: enriched,
    trust_summary: {
      restricted_or_below: restrictedOrBelow,
      levels: MCP_TRUST_LEVELS.reduce((acc, level) => {
        acc[level] = enriched.filter((s) => s.trust === level).length;
        return acc;
      }, {}),
      disabled: enriched.filter((s) => s.trust === "disabled").length,
    },
  };
}

export function buildMcpTrustApiPayload(paths = {}) {
  const loaded = loadMcpTrust(paths);
  return {
    version: loaded.config.version,
    defaults: loaded.config.defaults,
    servers: loaded.config.servers,
    paths: loaded.paths,
    origins: loaded.origins,
    config_merge: loaded.config_merge,
    levels: MCP_TRUST_LEVELS,
    read_only: true,
  };
}
