/**
 * Phase 26: marketplace catalog search + MCP add wizard.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "./paths.mjs";
import { cursorMcpPath, loadMcpJson } from "./dashboard-control.mjs";
import { resolveProjectRoot } from "./dashboard-project-recommend.mjs";
import { readJson } from "./read-json.mjs";

export function marketplaceDir() {
  return process.env.COSTGATE_MARKETPLACE_DIR ?? join(repoRoot(), "catalog/marketplace");
}

export const MARKETPLACE_CATEGORIES = [
  { id: "devtools", label: "DevTools & VCS" },
  { id: "filesystem", label: "Filesystem" },
  { id: "browser", label: "Browser & E2E" },
  { id: "database", label: "Database" },
  { id: "search", label: "Search & Fetch" },
  { id: "saas", label: "SaaS & Team" },
  { id: "cloud", label: "Cloud & Infra" },
  { id: "ai", label: "AI & Memory" },
];

const POPULARITY_RANK = { high: 3, medium: 2, low: 1 };

function categoryLabel(id, template) {
  return template.category_label ?? MARKETPLACE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
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
export function publicTemplate(template, { installed = false } = {}) {
  const category = template.category ?? "other";
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category,
    category_label: categoryLabel(category, template),
    tags: template.tags ?? [],
    tier_catalog: template.tier_catalog ?? null,
    install_target: template.install_target ?? "backend",
    backend_key: template.backend_key ?? null,
    required_env: template.required_env ?? [],
    compare_estimate: estimateCompare(template),
    builtin_hint: template.builtin_hint ?? null,
    official: template.official ?? false,
    gate_ready: template.gate_ready ?? template.install_target === "backend",
    popularity: template.popularity ?? "medium",
    docs_url: template.docs_url ?? null,
    requires_secrets: (template.required_env ?? []).some((e) => e.secret),
    installed,
  };
}

export function parseMarketplaceOptions(input = {}) {
  if (typeof input === "string") {
    return { q: input.trim() };
  }
  const truthy = (v) => v === "1" || v === "true" || v === true;
  const get = (key) => {
    if (input instanceof URLSearchParams) return input.get(key) ?? "";
    return input[key] ?? "";
  };
  return {
    q: String(get("q")).trim(),
    category: String(get("category")).trim(),
    sort: String(get("sort") || "name").trim(),
    gate_only: truthy(get("gate_only")),
    official_only: truthy(get("official_only")),
    hide_secrets: truthy(get("hide_secrets")),
  };
}

function sortTemplates(items, sort) {
  const list = [...items];
  if (sort === "popularity") {
    list.sort(
      (a, b) =>
        (POPULARITY_RANK[b.popularity] ?? 0) - (POPULARITY_RANK[a.popularity] ?? 0) ||
        a.name.localeCompare(b.name)
    );
    return list;
  }
  if (sort === "reduction") {
    list.sort(
      (a, b) =>
        (b.compare_estimate?.reduction_pct ?? 0) - (a.compare_estimate?.reduction_pct ?? 0) ||
        a.name.localeCompare(b.name)
    );
    return list;
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildCategorySummary(templates) {
  const counts = {};
  for (const t of templates) {
    const cat = t.category ?? "other";
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return MARKETPLACE_CATEGORIES.filter((c) => (counts[c.id] ?? 0) > 0).map((c) => ({
    id: c.id,
    label: c.label,
    count: counts[c.id] ?? 0,
  }));
}

export function searchMarketplace(options = "", dir = marketplaceDir(), context = {}) {
  const opts = parseMarketplaceOptions(options);
  const installedKeys = context.installedKeys ?? new Set();
  let items = loadMarketplaceCatalog(dir)
    .filter((t) => matchesQuery(t, opts.q))
    .filter((t) => !opts.category || t.category === opts.category)
    .filter((t) => !opts.gate_only || (t.gate_ready ?? t.install_target === "backend"))
    .filter((t) => !opts.official_only || t.official === true)
    .filter((t) => !opts.hide_secrets || !(t.required_env ?? []).some((e) => e.secret))
    .map((t) => {
      const installed =
        t.backend_key != null ? installedKeys.has(t.backend_key) : false;
      return publicTemplate(t, { installed });
    });
  return sortTemplates(items, opts.sort);
}

/**
 * Suggest directories for Filesystem MCP ALLOWED_PATH.
 * Uses project root, git root, and optional COSTGATE_WORKSPACE_ROOTS.
 */
export function suggestAllowedPaths(options = {}) {
  const projectRoot = resolve(resolveProjectRoot(options));
  const candidates = [];
  const seen = new Set();

  const add = (rawPath, reason, label) => {
    if (!rawPath) return;
    let abs;
    try {
      abs = resolve(String(rawPath));
    } catch {
      return;
    }
    if (!existsSync(abs)) return;
    try {
      if (!statSync(abs).isDirectory()) return;
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    candidates.push({ path: abs, reason, label });
  };

  add(projectRoot, "project_root", "Project root");

  let dir = projectRoot;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      add(dir, "git_root", "Git repository root");
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const extraRoots = process.env.COSTGATE_WORKSPACE_ROOTS ?? "";
  for (const raw of extraRoots.split(",")) {
    const trimmed = raw.trim();
    if (trimmed) add(trimmed, "workspace_root", "Workspace folder");
  }

  return { project_root: projectRoot, candidates };
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
