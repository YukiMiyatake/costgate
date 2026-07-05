/**
 * Phase 27: project-based MCP add recommendations (local static analysis only).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadMarketplaceCatalog, marketplaceDir } from "./dashboard-marketplace.mjs";

const SEARCH_MCP_PATTERN = /search|brave|google|tavily|exa|bing|serp/i;
const RULES_GH_PATTERN = /\bgh\b|pull request|\bPR\b|github/i;
const GATE_MCP_NAMES = new Set(["costgate-gate", "costgate-probe"]);

const SIGNAL_TEMPLATES = {
  playwright: ["browser"],
  "go.mod": ["filesystem", "github"],
  cursor_rules_gh_pr: ["github"],
};

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function resolveProjectRoot(options = {}) {
  if (options.projectRoot) return options.projectRoot;
  if (process.env.COSTGATE_PROJECT_ROOT) return process.env.COSTGATE_PROJECT_ROOT;
  return process.cwd();
}

function listRuleFiles(rulesDir) {
  const files = [];
  if (!existsSync(rulesDir)) return files;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (/\.(mdc?|json|txt)$/i.test(entry)) {
        files.push(full);
      }
    }
  };
  walk(rulesDir);
  return files;
}

function scanRulesForGhPr(projectRoot) {
  const rulesDir = join(projectRoot, ".cursor", "rules");
  for (const file of listRuleFiles(rulesDir)) {
    try {
      const text = readFileSync(file, "utf8");
      if (RULES_GH_PATTERN.test(text)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function hasPlaywrightDep(projectRoot) {
  const pkg = readJson(join(projectRoot, "package.json"));
  if (!pkg) return false;
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  return Object.keys(deps).some(
    (name) => name === "playwright" || name === "@playwright/test" || name.startsWith("@playwright/")
  );
}

export function detectProjectSignals(projectRoot) {
  const signals = [];
  if (hasPlaywrightDep(projectRoot)) signals.push("playwright");
  if (existsSync(join(projectRoot, "go.mod"))) signals.push("go.mod");
  if (scanRulesForGhPr(projectRoot)) signals.push("cursor_rules_gh_pr");
  return signals;
}

function loadMcpServers(mcpPath) {
  const raw = readJson(mcpPath);
  return raw?.mcpServers ?? {};
}

function loadBackends(configPath) {
  const raw = readJson(configPath);
  return raw?.backends ?? {};
}

function mcpConfigText(cfg) {
  return [cfg.command, ...(cfg.args ?? []), JSON.stringify(cfg.env ?? {})]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const GITHUB_MCP_NAME_PATTERN = /^(github|github-mcp|gh-mcp|server-github)(-\d+)?$/i;
const GITHUB_MCP_PACKAGE_PATTERN = /@modelcontextprotocol\/server-github|mcp-server-github/i;

function isDirectGithubMcpServer(name, cfg) {
  if (GATE_MCP_NAMES.has(name)) return false;
  if (GITHUB_MCP_NAME_PATTERN.test(name)) return true;

  const parts = [cfg.command, ...(cfg.args ?? []), JSON.stringify(cfg.env ?? {})]
    .filter(Boolean)
    .join(" ");
  return GITHUB_MCP_PACKAGE_PATTERN.test(parts);
}

function detectDirectGithubMcp(mcpServers) {
  const hasGate = "costgate-gate" in mcpServers;
  if (!hasGate) return null;

  for (const [name, cfg] of Object.entries(mcpServers)) {
    if (isDirectGithubMcpServer(name, cfg)) {
      return name;
    }
  }
  return null;
}

function detectSearchMcps(mcpServers) {
  return Object.keys(mcpServers).filter((name) => {
    if (GATE_MCP_NAMES.has(name)) return false;
    return SEARCH_MCP_PATTERN.test(name);
  });
}

function templateById(catalog, id) {
  return catalog.find((t) => t.id === id) ?? null;
}

function catalogPopularity(template, maxBefore) {
  const before = template?.compare_estimate?.before_tokens ?? 0;
  if (!before || !maxBefore) return 0.5;
  return Math.min(1, before / maxBefore);
}

function fitForSignal(signal, templateId) {
  if (signal === "playwright" && templateId === "browser") return 0.9;
  if (signal === "go.mod") {
    return templateId === "github" ? 0.78 : 0.72;
  }
  if (signal === "cursor_rules_gh_pr" && templateId === "github") return 0.85;
  return 0.6;
}

function isTemplateInstalled(template, backends, mcpServers) {
  if (!template) return false;
  const target = template.install_target ?? "backend";
  if (target === "backend") {
    const key = template.backend_key ?? template.id;
    if (backends[key]) return true;
  }
  if (target === "builtin") {
    for (const [name, cfg] of Object.entries(mcpServers)) {
      const blob = `${name} ${mcpConfigText(cfg)}`;
      if (/browser|playwright/.test(blob)) return true;
    }
  }
  return false;
}

function highFixedCostPenalty(template) {
  const before = template?.compare_estimate?.before_tokens ?? 0;
  if (before >= 3000) return 0.12;
  if (before >= 1500) return 0.08;
  if (before >= 800) return 0.04;
  return 0;
}

function scoreAddRecommendation({ fit, template, installed, maxBefore }) {
  const popularity = catalogPopularity(template, maxBefore);
  const duplicatePenalty = installed ? 1 : 0;
  const fixedPenalty = highFixedCostPenalty(template);
  const raw = fit * popularity - duplicatePenalty - fixedPenalty;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;
}

function signalDetail(signal, templateId) {
  if (signal === "playwright") return "playwright in package.json";
  if (signal === "go.mod") {
    return templateId === "filesystem"
      ? "go.mod at repository root — local file access"
      : "go.mod at repository root — GitHub workflows";
  }
  if (signal === "cursor_rules_gh_pr") {
    return "Cursor rules mention gh / PR / GitHub";
  }
  return `signal: ${signal}`;
}

function buildSignalRecommendations(signals, catalog, backends, mcpServers) {
  const maxBefore = Math.max(
    1,
    ...catalog.map((t) => t.compare_estimate?.before_tokens ?? 0)
  );
  const seen = new Set();
  const items = [];

  for (const signal of signals) {
    const templateIds = SIGNAL_TEMPLATES[signal] ?? [];
    for (const templateId of templateIds) {
      const key = `${signal}:${templateId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const template = templateById(catalog, templateId);
      if (!template) continue;

      const installed = isTemplateInstalled(template, backends, mcpServers);
      const fit = fitForSignal(signal, templateId);
      const score = scoreAddRecommendation({ fit, template, installed, maxBefore });
      if (score <= 0) continue;

      items.push({
        kind: "add_mcp",
        reason: "recommend_add",
        target: templateId,
        template: templateId,
        score,
        detail: signalDetail(signal, templateId),
        signals: [signal],
      });
    }
  }

  return items.sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
}

function buildSwitchToGateRecommendation(directName, catalog) {
  const template = templateById(catalog, "github");
  const maxBefore = template?.compare_estimate?.before_tokens ?? 3357;
  const fit = 0.95;
  const popularity = catalogPopularity(template, maxBefore);
  const score = Math.round(Math.max(0, Math.min(1, fit * popularity - 0.05)) * 100) / 100;

  return {
    kind: "switch_mcp",
    reason: "recommend_add",
    target: directName,
    template: "github",
    score,
    detail: `Direct GitHub MCP "${directName}" — switch to Gate for ~69% tools/list reduction`,
    signals: ["direct_github_mcp"],
  };
}

function buildConsolidateSearchRecommendation(searchNames) {
  return {
    kind: "consolidate_mcp",
    reason: "recommend_add",
    target: searchNames.join(", "),
    template: null,
    score: 0.55,
    detail: `${searchNames.length} search MCPs enabled — consolidate to reduce duplicate fixed cost`,
    signals: ["multiple_search_mcps"],
  };
}

/**
 * Scan project workspace and return scored add/switch/consolidate recommendations.
 */
export function buildProjectRecommendations(options = {}) {
  const projectRoot = resolveProjectRoot(options);
  const mcpPath = options.mcpPath;
  const configPath = options.configPath;
  const catalogDir = options.marketplaceDir ?? marketplaceDir();

  const signals = detectProjectSignals(projectRoot);
  const catalog = loadMarketplaceCatalog(catalogDir);
  const backends = configPath ? loadBackends(configPath) : {};
  const mcpServers = mcpPath ? loadMcpServers(mcpPath) : {};

  const items = buildSignalRecommendations(signals, catalog, backends, mcpServers);

  const directGithub = detectDirectGithubMcp(mcpServers);
  if (directGithub) {
    items.unshift(buildSwitchToGateRecommendation(directGithub, catalog));
  }

  const searchMcps = detectSearchMcps(mcpServers);
  if (searchMcps.length >= 2) {
    items.push(buildConsolidateSearchRecommendation(searchMcps));
  }

  return {
    project_root: projectRoot,
    signals_detected: signals,
    items,
  };
}
