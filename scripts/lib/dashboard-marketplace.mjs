/**
 * Phase 26: marketplace catalog search + MCP add wizard.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "./paths.mjs";
import { cursorMcpPath, loadMcpJson } from "./dashboard-control.mjs";

export function marketplaceDir() {
  return process.env.COSTGATE_MARKETPLACE_DIR ?? join(repoRoot(), "catalog/marketplace");
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function loadMarketplaceCatalog(dir = marketplaceDir()) {
  const items = [];
  if (!existsSync(dir)) return items;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data = readJson(join(dir, file));
    if (data?.id) items.push(data);
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function matchesQuery(template, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = [
    template.id,
    template.name,
    template.description,
    template.category,
    ...(template.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/** Public fields for API listing (no secret defaults). */
export function publicTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    tags: template.tags ?? [],
    tier_catalog: template.tier_catalog ?? null,
    install_target: template.install_target ?? "backend",
    backend_key: template.backend_key ?? null,
    required_env: template.required_env ?? [],
    compare_estimate: estimateCompare(template),
    builtin_hint: template.builtin_hint ?? null,
  };
}

export function searchMarketplace(query = "", dir = marketplaceDir()) {
  const q = String(query).trim();
  return loadMarketplaceCatalog(dir)
    .filter((t) => matchesQuery(t, q))
    .map(publicTemplate);
}

function pctReduction(before, after) {
  if (!before || before <= 0) return 0;
  return Math.round(((before - after) / before) * 1000) / 10;
}

/**
 * Catalog-based compare estimate (no Gate subprocess).
 * Uses template.compare_estimate when present.
 */
export function estimateCompare(template) {
  const est = template.compare_estimate;
  if (!est) {
    return null;
  }
  const before = est.before_tokens ?? 0;
  const after = est.after_tokens ?? 0;
  return {
    tool_count: est.tool_count ?? null,
    before_tokens: before,
    after_tokens: after,
    reduction_pct: pctReduction(before, after),
    source: est.source ?? "catalog",
  };
}

function substituteValue(value, env) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => {
    if (env[key] == null || env[key] === "") {
      throw new Error(`missing required env: ${key}`);
    }
    return String(env[key]);
  });
}

function deepSubstitute(obj, env) {
  if (Array.isArray(obj)) {
    return obj.map((v) => deepSubstitute(v, env));
  }
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepSubstitute(v, env);
    }
    return out;
  }
  return substituteValue(obj, env);
}

function applyEnvMappings(template, userEnv) {
  const merged = { ...userEnv };
  for (const spec of template.required_env ?? []) {
    if (spec.maps_to && merged[spec.name] != null && merged[spec.maps_to] == null) {
      merged[spec.maps_to] = merged[spec.name];
    }
  }
  return merged;
}

function validateRequiredEnv(template, userEnv) {
  for (const spec of template.required_env ?? []) {
    const val = userEnv[spec.name];
    if (val == null || String(val).trim() === "") {
      throw new Error(`missing required env: ${spec.name}`);
    }
  }
}

export function loadTemplateById(templateId, dir = marketplaceDir()) {
  const id = String(templateId).trim();
  return loadMarketplaceCatalog(dir).find((t) => t.id === id) ?? null;
}

export function backendsPath(configPath) {
  return configPath;
}

export function loadBackendsJson(configPath) {
  if (!existsSync(configPath)) {
    return { backends: {} };
  }
  const raw = readJson(configPath);
  return { backends: raw?.backends ?? {} };
}

export function saveBackendsJson(data, configPath) {
  mkdirSync(dirname(configPath), { recursive: true });
  const payload = { backends: data.backends ?? {} };
  writeFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function backupFile(path) {
  if (!existsSync(path)) return null;
  const backup = `${path}.bak`;
  copyFileSync(path, backup);
  return backup;
}

function buildBackendEntry(template, userEnv) {
  const env = applyEnvMappings(template, userEnv);
  validateRequiredEnv(template, env);
  return deepSubstitute(template.backend_template, env);
}

function mergeMcpSnippet(config, snippet) {
  config.mcpServers ??= {};
  for (const [name, entry] of Object.entries(snippet)) {
    config.mcpServers[name] = entry;
  }
}

/**
 * Add MCP from marketplace template.
 * Writes backends.json and/or mcp.json with backup.
 */
export function addMcpFromTemplate(templateId, userEnv = {}, paths = {}) {
  const template = loadTemplateById(templateId, paths.marketplaceDir);
  if (!template) {
    throw new Error(`unknown template: ${templateId}`);
  }

  const configPath = paths.configPath ?? paths.backendsPath;
  const mcpPath = paths.mcpPath ?? cursorMcpPath();
  const compare_estimate = estimateCompare(template);
  const result = {
    ok: true,
    template: template.id,
    backend: null,
    mcp_snippet: null,
    compare_estimate,
    requires_cursor_restart: false,
    backups: {},
    hint: template.builtin_hint ?? null,
  };

  const target = template.install_target ?? "backend";

  if (target === "backend") {
    if (!configPath) {
      throw new Error("configPath required for backend install");
    }
    const backendKey = template.backend_key ?? template.id;
    const entry = buildBackendEntry(template, userEnv);
    const data = loadBackendsJson(configPath);
    if (data.backends[backendKey]) {
      throw new Error(`backend "${backendKey}" already exists in backends.json`);
    }
    result.backups.backends = backupFile(configPath);
    data.backends[backendKey] = entry;
    saveBackendsJson(data, configPath);
    result.backend = backendKey;
  }

  if (template.mcp_snippet) {
    const config = loadMcpJson(mcpPath);
    result.backups.mcp = backupFile(mcpPath);
    const snippet = deepSubstitute(template.mcp_snippet, applyEnvMappings(template, userEnv));
    mergeMcpSnippet(config, snippet);
    writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    result.mcp_snippet = snippet;
    result.requires_cursor_restart = true;
  }

  if (target === "mcp" && !template.mcp_snippet) {
    throw new Error(`template "${templateId}" has no mcp_snippet`);
  }

  return result;
}
