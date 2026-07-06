/**
 * Phase 23: read-only dashboard data aggregation.
 * Reuses parse-probe-logs patterns; no writes to config or mcp.json.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJson } from "./read-json.mjs";
import {
  parseProbeLogs,
  mcpMeasurableTokens,
  fixedSharePct,
  bytesToTokens,
} from "./parse-probe-logs.mjs";
import { repoRoot } from "./paths.mjs";
import { loadToolOverrides, loadMcpDisabled } from "./dashboard-control.mjs";
import { buildProjectRecommendations } from "./dashboard-project-recommend.mjs";
import { resolveEffectiveConfig } from "./dashboard-config-merge.mjs";
import { enrichMcpsWithTrust, loadMcpTrust } from "./mcp-trust.mjs";
import { readLatestPromptIntent, promptIntentDir } from "./prompt-intent.mjs";
import { buildShieldPromptSnapshot, shieldPromptBlockDir } from "./shield-prompt.mjs";

const GATE_MCP_NAMES = new Set(["costgate-gate", "costgate-probe"]);
const MS_PER_DAY = 86_400_000;
export const DASHBOARD_VERSION = "31a";

export function defaultPaths() {
  const home = homedir();
  const logDir = process.env.COSTGATE_PROBE_LOG_DIR ?? join(home, ".costgate", "logs");
  return {
    logDir,
    gateLogDir: process.env.COSTGATE_GATE_LOG_DIR ?? logDir,
    usagePath: process.env.COSTGATE_USAGE_PATH ?? join(home, ".costgate", "usage.json"),
    configPath: process.env.COSTGATE_CONFIG ?? join(home, ".costgate", "backends.json"),
    mcpPath: process.env.CURSOR_MCP_PATH ?? join(home, ".cursor", "mcp.json"),
    overridesPath:
      process.env.COSTGATE_TOOL_OVERRIDES ??
      join(home, ".costgate", "tool-overrides.json"),
    disabledPath:
      process.env.COSTGATE_MCP_DISABLED_PATH ??
      join(home, ".costgate", "mcp-disabled.json"),
    tierDir: join(repoRoot(), "packages/gate/internal/catalog/tiers"),
    marketplaceDir:
      process.env.COSTGATE_MARKETPLACE_DIR ?? join(repoRoot(), "catalog/marketplace"),
    promptIntentDir: process.env.COSTGATE_PROMPT_INTENT_DIR ?? promptIntentDir(),
    shieldPromptBlockDir:
      process.env.COSTGATE_SHIELD_PROMPT_DIR ?? shieldPromptBlockDir(),
    gateSettingsPath:
      process.env.COSTGATE_GATE_SETTINGS_PATH ?? join(home, ".costgate", "gate-settings.json"),
    trustPath: process.env.COSTGATE_TRUST_PATH ?? join(home, ".costgate", "mcp-trust.json"),
  };
}

const PROMPT_INTENT_WINDOW_MS = 10 * 60 * 1000;

/** Latest prompt-intent hook record for Dashboard overview (Phase 28c). */
export function buildPromptIntentSnapshot(options = {}) {
  const dir = options.promptIntentDir ?? defaultPaths().promptIntentDir;
  const record = readLatestPromptIntent({ dir });
  if (!record?.keywords) return null;
  const ageMs = record.ts ? (options.now ?? Date.now()) - record.ts : null;
  return {
    keywords: record.keywords,
    templates: record.templates ?? [],
    sources: record.sources ?? [],
    ts: record.ts ?? null,
    conversation_id: record.conversation_id ?? null,
    generation_id: record.generation_id ?? null,
    stale: ageMs != null && ageMs > PROMPT_INTENT_WINDOW_MS,
    age_sec: ageMs != null ? Math.round(ageMs / 1000) : null,
  };
}

function loadTierCatalogs(tierDir) {
  const catalogs = {};
  if (!existsSync(tierDir)) return catalogs;
  for (const file of readdirSync(tierDir).filter((f) => f.endsWith(".json"))) {
    const data = readJson(join(tierDir, file));
    if (data?.backend) {
      catalogs[data.backend] = data;
    }
  }
  return catalogs;
}

function loadUsage(usagePath) {
  const raw = readJson(usagePath);
  return raw?.tools ?? {};
}

function loadBackends(configPath) {
  const raw = readJson(configPath);
  return raw?.backends ?? {};
}

function loadMcpServers(mcpPath) {
  const raw = readJson(mcpPath);
  return raw?.mcpServers ?? {};
}

/**
 * Per-tool stats from Probe + Gate JSONL (list cost, calls, backend, last_used).
 */
export function parseProbeToolStats(logDir, windowDays = null, gateLogDir = logDir) {
  const byTool = new Map();
  const byBackend = new Map();
  let cutoff = null;
  if (windowDays != null && windowDays > 0) {
    cutoff = Date.now() - windowDays * MS_PER_DAY;
  }

  const listTokenSamples = [];
  ingestProbeToolStats(logDir, cutoff, byTool, byBackend, listTokenSamples);
  ingestGateToolStats(gateLogDir, cutoff, byTool, byBackend);

  return { byTool, byBackend, listTokenSamples };
}

function ingestProbeToolStats(logDir, cutoff, byTool, byBackend, listTokenSamples) {
  if (!existsSync(logDir)) return;

  for (const file of readdirSync(logDir).filter(
    (f) => f.startsWith("probe-") && f.endsWith(".jsonl")
  )) {
    for (const line of readFileSync(join(logDir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (cutoff && row.ts) {
        const ts = Date.parse(row.ts);
        if (!Number.isNaN(ts) && ts < cutoff) continue;
      }

      if (row.type === "tools_list" && Array.isArray(row.tools)) {
        for (const t of row.tools) {
          if (!t?.name) continue;
          const tok = t.estimated_tokens ?? bytesToTokens(t.schema_bytes ?? 0);
          listTokenSamples.push(tok);
          const cur = byTool.get(t.name) ?? {
            name: t.name,
            backend: null,
            call_count: 0,
            last_used: null,
            estimated_list_tokens: 0,
            list_samples: 0,
          };
          cur.estimated_list_tokens =
            (cur.estimated_list_tokens * cur.list_samples + tok) / (cur.list_samples + 1);
          cur.list_samples++;
          byTool.set(t.name, cur);
        }
      }

      if (row.type === "tool_call" && row.tool) {
        mergeToolCallRow(row, byTool, byBackend);
      }
    }
  }
}

function ingestGateToolStats(gateLogDir, cutoff, byTool, byBackend) {
  if (!existsSync(gateLogDir)) return;

  for (const file of readdirSync(gateLogDir).filter(
    (f) => f.startsWith("gate-") && f.endsWith(".jsonl")
  )) {
    for (const line of readFileSync(join(gateLogDir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.type !== "gate_event") continue;
      if (cutoff && row.ts) {
        const ts = Date.parse(row.ts);
        if (!Number.isNaN(ts) && ts < cutoff) continue;
      }

      if (row.event === "tool_call" && row.tool) {
        mergeToolCallRow(
          { tool: row.tool, backend: row.backend ?? null, ts: row.ts },
          byTool,
          byBackend
        );
      }
    }
  }
}

function mergeToolCallRow(row, byTool, byBackend) {
  const cur = byTool.get(row.tool) ?? {
    name: row.tool,
    backend: row.backend ?? null,
    call_count: 0,
    last_used: null,
    estimated_list_tokens: 0,
    list_samples: 0,
  };
  cur.call_count++;
  if (row.backend) cur.backend = row.backend;
  if (row.ts) {
    const prev = cur.last_used ? Date.parse(cur.last_used) : 0;
    const ts = Date.parse(row.ts);
    if (!Number.isNaN(ts) && ts >= prev) cur.last_used = row.ts;
  }
  byTool.set(row.tool, cur);

  const backend = row.backend ?? "unknown";
  const bc = byBackend.get(backend) ?? {
    backend,
    call_count: 0,
    tools: new Set(),
    last_used: null,
  };
  bc.call_count++;
  bc.tools.add(row.tool);
  if (row.ts) {
    const prev = bc.last_used ? Date.parse(bc.last_used) : 0;
    const ts = Date.parse(row.ts);
    if (!Number.isNaN(ts) && ts >= prev) bc.last_used = row.ts;
  }
  byBackend.set(backend, bc);
}

function primaryBackend(backends) {
  if (backends.github) return "github";
  const keys = Object.keys(backends);
  return keys.length === 1 ? keys[0] : keys[0] ?? null;
}

function tierForTool(name, backend, catalogs, defaultBackend) {
  const b = backend ?? defaultBackend;
  const cat = b ? catalogs[b] : null;
  if (cat?.overrides?.[name]) return cat.overrides[name];
  return null;
}

function staleDays(lastUsed, now = Date.now()) {
  if (!lastUsed) return Infinity;
  const ts = Date.parse(lastUsed);
  if (Number.isNaN(ts)) return Infinity;
  return Math.floor((now - ts) / MS_PER_DAY);
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function mergeToolStats(probeByTool, usage, catalogs, defaultBackend, now, overrides = {}) {
  const names = new Set([...probeByTool.keys(), ...Object.keys(usage)]);
  const tools = [];

  for (const name of names) {
    const probe = probeByTool.get(name);
    const u = usage[name];
    const backend = probe?.backend ?? defaultBackend;
    const callCount = Math.max(probe?.call_count ?? 0, u?.call_count ?? 0);
    let lastUsed = probe?.last_used ?? null;
    if (u?.last_used) {
      const uTs = Date.parse(u.last_used);
      const lTs = lastUsed ? Date.parse(lastUsed) : 0;
      if (!Number.isNaN(uTs) && uTs >= lTs) lastUsed = u.last_used;
    }
    const tier = overrides[name]?.force_tier ?? tierForTool(name, backend, catalogs, defaultBackend);
    const forced = Boolean(overrides[name]?.force_tier);
    tools.push({
      name,
      backend,
      tier,
      forced_tier: forced,
      call_count: callCount,
      last_used: lastUsed,
      estimated_list_tokens: probe?.estimated_list_tokens
        ? Math.round(probe.estimated_list_tokens)
        : null,
      stale_days: staleDays(lastUsed, now),
      recommendation: null,
    });
  }

  return tools.sort((a, b) => b.call_count - a.call_count || a.name.localeCompare(b.name));
}

function scoreRecommendations(tools, listTokenSamples, byBackend, backends, now) {
  const p90 = percentile(listTokenSamples, 90);
  const recs = [];

  for (const tool of tools) {
    if (tool.call_count === 0 && tool.tier === "C" && tool.stale_days >= 90) {
      tool.recommendation = "stale_90d";
      recs.push({
        kind: "delete_tool",
        reason: "stale_90d",
        target: tool.name,
        backend: tool.backend,
        detail: `Tier C, unused ${tool.stale_days === Infinity ? "ever" : `${tool.stale_days}+ days`}`,
      });
    } else if (
      tool.call_count === 0 &&
      tool.estimated_list_tokens != null &&
      tool.estimated_list_tokens >= p90 &&
      tool.stale_days >= 30
    ) {
      tool.recommendation = "high_cost_unused";
      recs.push({
        kind: "delete_tool",
        reason: "high_cost_unused",
        target: tool.name,
        backend: tool.backend,
        detail: `~${tool.estimated_list_tokens} list tokens, unused ${tool.stale_days === Infinity ? "ever" : `${tool.stale_days}+ days`}`,
      });
    }
  }

  for (const [backend, stats] of byBackend) {
    if (stats.call_count > 0) continue;
    if (!backends[backend]) continue;
    recs.push({
      kind: "delete_backend",
      reason: "gate_excluded_ok",
      target: backend,
      backend,
      detail: "Gate backend with no tool calls in window",
    });
  }

  return recs;
}

function detectBlindSpots(mcpServers, backends) {
  const blind = [];
  for (const name of Object.keys(mcpServers)) {
    if (GATE_MCP_NAMES.has(name)) continue;
    blind.push(name);
  }
  return blind.sort();
}

function buildMcps(mcpServers, backends, byBackend, mode, disabledStore = {}, backendOrigins = {}) {
  const items = [];
  const seen = new Set();

  for (const [name, cfg] of Object.entries(mcpServers)) {
    seen.add(name);
    const isGate = name === "costgate-gate";
    const isProbe = name === "costgate-probe";
    const measured = isGate || isProbe;
    items.push({
      name,
      source: "mcp.json",
      role: isGate ? "gate" : isProbe ? "probe" : "direct",
      measured,
      blind_spot: !measured,
      enabled: true,
      command: cfg.command ?? null,
      backends: isGate || isProbe ? Object.keys(backends) : [],
    });
  }

  for (const [name, cfg] of Object.entries(disabledStore)) {
    if (seen.has(name)) continue;
    items.push({
      name,
      source: "mcp-disabled.json",
      role: "disabled",
      measured: false,
      blind_spot: true,
      enabled: false,
      command: cfg.command ?? null,
      backends: [],
    });
  }

  for (const backend of Object.keys(backends)) {
    if (seen.has(backend)) continue;
    const stats = byBackend.get(backend);
    items.push({
      name: backend,
      source: "backends.json",
      role: "backend",
      measured: true,
      blind_spot: false,
      command: backends[backend]?.command ?? null,
      backends: [backend],
      call_count: stats?.call_count ?? 0,
      config_origin: backendOrigins[backend] ?? "project",
    });
  }

  return {
    mode,
    servers: items.sort((a, b) => a.name.localeCompare(b.name)),
    blind_spots: items.filter((s) => s.blind_spot).map((s) => s.name),
  };
}

function detectCursorMode(mcpServers) {
  const hasGate = "costgate-gate" in mcpServers;
  const hasProbe = "costgate-probe" in mcpServers;
  if (hasGate && !hasProbe) return "production";
  if (hasProbe && !hasGate) return "measurement";
  if (hasGate && hasProbe) return "both";
  return "none";
}

/**
 * Build full dashboard payload (overview, tools, mcps, recommendations).
 */
export function buildDashboardData(options = {}) {
  const paths = { ...defaultPaths(), ...options };
  const globalPaths = options.globalPaths ?? defaultPaths();
  const windowDays = options.windowDays ?? 30;
  const now = options.now ?? Date.now();

  const logs = parseProbeLogs(paths.logDir);
  const { byTool, byBackend, listTokenSamples } = parseProbeToolStats(
    paths.logDir,
    windowDays,
    paths.gateLogDir
  );
  const usage = loadUsage(paths.usagePath);
  const effective = resolveEffectiveConfig(paths, globalPaths);
  const backends = effective.backends;
  const backendOrigins = effective.backendOrigins;
  const mcpServers = loadMcpServers(paths.mcpPath);
  const catalogs = loadTierCatalogs(paths.tierDir);
  const defaultBackend = primaryBackend(backends);

  const g = logs.global;
  const overrides = effective.overrides;
  const disabledStore = effective.disabledStore;
  const tools = mergeToolStats(byTool, usage, catalogs, defaultBackend, now, overrides);
  const deleteRecommendations = scoreRecommendations(
    tools,
    listTokenSamples,
    byBackend,
    backends,
    now
  );
  const projectRecs = buildProjectRecommendations({
    projectRoot: paths.projectRoot,
    mcpPath: paths.mcpPath,
    configPath: paths.configPath,
    marketplaceDir: paths.marketplaceDir,
  });
  const recommendations = [...projectRecs.items, ...deleteRecommendations].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || String(a.target).localeCompare(String(b.target))
  );
  const mcpsBase = buildMcps(
    mcpServers,
    backends,
    byBackend,
    detectCursorMode(mcpServers),
    disabledStore,
    backendOrigins
  );
  const trustPaths = {
    globalPath: options.globalPaths?.trustPath ?? globalPaths.trustPath,
    projectPath: paths.trustPath,
    projectRoot: paths.projectRoot,
  };
  const trustLoaded = loadMcpTrust(trustPaths);
  const mcpsWithTrust = enrichMcpsWithTrust(mcpsBase.servers, {
    trust: trustLoaded,
    marketplaceDir: paths.marketplaceDir,
  });
  const mcps = {
    ...mcpsBase,
    servers: mcpsWithTrust.servers,
    trust_summary: mcpsWithTrust.trust_summary,
  };
  const promptIntent = buildPromptIntentSnapshot({ ...paths, now });
  const shieldPrompt = buildShieldPromptSnapshot({ dir: paths.shieldPromptBlockDir, now });

  return {
    generated_at: new Date(now).toISOString(),
    window_days: windowDays,
    config_merge: effective.config_merge,
    paths: {
      log_dir: paths.logDir,
      usage: paths.usagePath,
      backends: paths.configPath,
      global_backends: effective.global_config_path ?? null,
      mcp: paths.mcpPath,
    },
    overview: {
      period: logs.period,
      sessions: g.sessions,
      tools_list_events: g.tools_list_events,
      tools_list_tokens: g.tools_list_tokens,
      tool_calls: g.tool_calls,
      tool_call_tokens: g.tool_call_tokens,
      mcp_measurable_total_tokens: mcpMeasurableTokens(g),
      fixed_share_pct: fixedSharePct(g),
      tool_count: tools.length,
      recommendation_count: recommendations.length,
      add_recommendation_count: projectRecs.items.length,
      delete_recommendation_count: deleteRecommendations.length,
      blind_spot_count: mcps.blind_spots.length,
      trust_restricted_count: mcps.trust_summary?.restricted_or_below ?? 0,
      cursor_mode: mcps.mode,
      config_merge: effective.config_merge,
      prompt_intent: promptIntent,
      shield_prompt: shieldPrompt,
      shield_prompt_block_count: shieldPrompt.block_count ?? 0,
    },
    tools: {
      tools,
      blind_spots: mcps.blind_spots,
    },
    mcps,
    recommendations: {
      items: recommendations,
      project_root: projectRecs.project_root,
      signals_detected: projectRecs.signals_detected,
      rules: ["recommend_add", "stale_90d", "high_cost_unused", "gate_excluded_ok"],
      counts: {
        add: projectRecs.items.length,
        delete: deleteRecommendations.length,
        total: recommendations.length,
      },
    },
  };
}

export function buildHealth(extra = {}) {
  const paths = defaultPaths();
  return {
    status: "ok",
    version: DASHBOARD_VERSION,
    read_only: false,
    writes: {
      localhost_only: true,
      token_required: extra.writeTokenRequired ?? false,
    },
    bind: "127.0.0.1",
    data_sources: {
      probe_logs: existsSync(paths.logDir),
      gate_logs: existsSync(paths.gateLogDir),
      usage: existsSync(paths.usagePath),
      backends: existsSync(paths.configPath),
      mcp: existsSync(paths.mcpPath),
      overrides: existsSync(paths.overridesPath),
      marketplace: existsSync(paths.marketplaceDir),
      prompt_intent: existsSync(paths.promptIntentDir),
      shield_prompt: existsSync(paths.shieldPromptBlockDir),
      mcp_trust: existsSync(paths.trustPath),
    },
    capabilities: {
      ui_settings: true,
      shield_settings: true,
      gate_settings: true,
      mcp_trust: true,
    },
  };
}
