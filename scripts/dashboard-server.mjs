#!/usr/bin/env node
/**
 * Phase 23–24: local dashboard (read + control on localhost).
 *
 * Usage:
 *   npm run dashboard
 *   COSTGATE_DASHBOARD_PORT=9000 npm run dashboard
 *   COSTGATE_DASHBOARD_TOKEN=secret npm run dashboard
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDashboardData, buildHealth, buildToolsPayload, defaultPaths } from "./lib/dashboard-data.mjs";
import {
  loadToolOverrides,
  patchToolOverride,
  bulkHideTools,
  setMcpServerEnabled,
  previewMcpDisable,
  toolOverridesPath,
} from "./lib/dashboard-control.mjs";
import {
  addMcpServerRaw,
  deleteMcpServer,
  getMcpServerDetail,
  updateMcpServerConfig,
} from "./lib/mcp-crud.mjs";
import {
  buildGateSettingsApiPayload,
  patchGateSettings,
} from "./lib/gate-settings.mjs";
import { buildMcpTrustApiPayload, patchMcpTrust } from "./lib/mcp-trust.mjs";
import { buildGateStatusPayload } from "./lib/dashboard-gate-status.mjs";
import {
  buildShieldPromptApiPayload,
  sanitizePromptApiBody,
} from "./lib/shield-prompt.mjs";
import {
  searchMarketplace,
  addMcpFromTemplate,
  suggestAllowedPaths,
  buildCategorySummary,
  parseMarketplaceOptions,
  loadBackendsJson,
} from "./lib/dashboard-marketplace.mjs";
import { resolveEffectiveConfig } from "./lib/dashboard-config-merge.mjs";
import {
  listWorkspaces,
  pinWorkspace,
  resolveWorkspace,
  registryPath,
} from "./lib/dashboard-workspaces.mjs";
import {
  buildUiSettingsApiPayload,
  patchUiSettings,
} from "./lib/dashboard-ui-settings.mjs";
import {
  buildShieldSettingsApiPayload,
  patchShieldSettings,
} from "./lib/shield-settings.mjs";
import { defaultHooksPath } from "./lib/cursor-hooks.mjs";
import {
  fetchDashboardHealth,
  isDashboardFresh,
  killProcessOnPort,
} from "./lib/dashboard-probe.mjs";
import { clearDashboardBrowserOpenedFlag } from "./lib/dashboard-browser-flag.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = join(ROOT, "dashboard-ui");
const HOST = process.env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.COSTGATE_DASHBOARD_PORT ?? "8787");
const WRITE_TOKEN = process.env.COSTGATE_DASHBOARD_TOKEN ?? "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = join(UI_DIR, rel.replace(/^\/+/, ""));
  if (!file.startsWith(UI_DIR) || !existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = extname(file);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function authorizeWrite(req) {
  if (WRITE_TOKEN) {
    const header = req.headers["x-costgate-dashboard-token"];
    if (header !== WRITE_TOKEN) {
      return false;
    }
  }
  return true;
}

/** /api/marketplace/ → /api/marketplace (trailing slash broke search with 404). */
function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "") || "/";
  }
  return pathname;
}

function apiNotFound(res, pathname) {
  json(res, 404, { error: "not_found", path: pathname });
}

function resolveMarketplaceDir(controlPaths, dataOptions) {
  return (
    controlPaths.marketplaceDir ??
    dataOptions.marketplaceDir ??
    defaultPaths().marketplaceDir
  );
}

function mcpCrudOpts(paths) {
  return {
    mcpPath: paths.mcpPath,
    disabledPath: paths.disabledPath,
    configPath: paths.configPath,
    globalConfigPath: paths.globalPaths?.configPath ?? defaultPaths().configPath,
    scoped: Boolean(paths.scoped),
  };
}

function scopedDataOptions(workspaceCtx, dataOptions, controlPaths) {
  const global = defaultPaths();
  return {
    ...global,
    ...dataOptions,
    ...controlPaths,
    projectRoot: workspaceCtx.projectRoot,
    configPath: workspaceCtx.configPath,
    overridesPath: workspaceCtx.overridesPath,
    disabledPath: workspaceCtx.disabledPath,
    gateSettingsPath: workspaceCtx.gateSettingsPath,
    trustPath: workspaceCtx.trustPath,
    usagePath: workspaceCtx.usagePath,
    logDir: workspaceCtx.logDir,
    gateLogDir: workspaceCtx.gateLogDir,
    mcpPath: workspaceCtx.mcpPath ?? controlPaths.mcpPath ?? global.mcpPath,
    workspace_id: workspaceCtx.id,
    workspace_path: workspaceCtx.projectRoot,
    scoped: true,
    globalPaths: global,
  };
}

function marketplacePayload(url, paths, marketplaceDirPath) {
  const pathHints = suggestAllowedPaths({ projectRoot: paths.projectRoot });
  const opts = parseMarketplaceOptions(url.searchParams);
  const globalPaths = paths.globalPaths ?? defaultPaths();
  const effective = resolveEffectiveConfig(
    { ...paths, scoped: Boolean(paths.scoped ?? paths.workspace_id) },
    globalPaths
  );
  const installedKeys = new Set(Object.keys(effective.backends ?? {}));
  const allPublic = searchMarketplace("", marketplaceDirPath, { installedKeys });
  const templates = searchMarketplace(url.searchParams, marketplaceDirPath, { installedKeys });
  return {
    query: opts.q,
    category: opts.category || null,
    sort: opts.sort,
    filters: {
      gate_only: opts.gate_only,
      official_only: opts.official_only,
      hide_secrets: opts.hide_secrets,
    },
    catalog_dir: marketplaceDirPath,
    catalog_available: existsSync(marketplaceDirPath),
    catalog_count: allPublic.length,
    categories: buildCategorySummary(allPublic),
    project_root: pathHints.project_root,
    path_candidates: pathHints.candidates,
    installed_backends: [...installedKeys],
    templates,
    workspace_id: paths.workspace_id ?? null,
    workspace_path: paths.workspace_path ?? null,
  };
}

function gateSettingsOpts(paths) {
  const scoped = Boolean(paths.scoped ?? paths.workspace_id);
  return {
    projectRoot: paths.projectRoot ?? paths.workspace_path,
    scoped,
  };
}

function gateStatusOpts(paths) {
  const global = defaultPaths();
  return {
    projectRoot: paths.projectRoot ?? paths.workspace_path ?? null,
    gateSettingsPath: paths.gateSettingsPath,
    overridesPath: paths.overridesPath ?? toolOverridesPath(),
    gateLogDir: paths.gateLogDir ?? global.gateLogDir,
    globalGateLogDir: paths.globalPaths?.gateLogDir ?? global.gateLogDir,
  };
}

function mcpTrustOpts(paths) {
  const scoped = Boolean(paths.scoped ?? paths.workspace_id);
  const projectRoot = paths.projectRoot ?? paths.workspace_path;
  if (!scoped || !projectRoot) {
    return { globalPath: paths.trustPath ?? defaultPaths().trustPath };
  }
  return {
    globalPath: paths.globalPaths?.trustPath ?? defaultPaths().trustPath,
    projectPath: paths.trustPath,
    projectRoot,
  };
}

function mcpTrustPatchOpts(paths) {
  const scoped = Boolean(paths.scoped ?? paths.workspace_id);
  return {
    ...mcpTrustOpts(paths),
    scoped,
    projectRoot: paths.projectRoot ?? paths.workspace_path,
  };
}

async function handleWorkspaceRoute(method, pathname, url, req, res, ctx) {
  const { dataOptions, controlPaths, marketplaceDirPath } = ctx;

  if (pathname === "/api/workspaces" && method === "GET") {
    json(res, 200, listWorkspaces({ registryPath: registryPath() }));
    return true;
  }

  if (pathname === "/api/workspaces/pin" && method === "POST") {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const body = await readBody(req);
    if (!body.path) {
      json(res, 400, { error: "path required" });
      return true;
    }
    json(res, 200, pinWorkspace(body.path));
    return true;
  }

  function resolveWorkspaceRequest(wsIdRaw, res) {
    try {
      const wsId = decodeURIComponent(wsIdRaw);
      const workspaceCtx = resolveWorkspace(wsId, { globalFallback: defaultPaths() });
      const paths = scopedDataOptions(workspaceCtx, dataOptions, controlPaths);
      return { wsId, workspaceCtx, paths };
    } catch (e) {
      json(res, 404, { error: e.message ?? String(e) });
      return null;
    }
  }

  const mcpByName = pathname.match(/^\/api\/workspaces\/([^/]+)\/mcps\/([^/]+)$/);
  if (mcpByName && method === "GET") {
    const resolved = resolveWorkspaceRequest(mcpByName[1], res);
    if (!resolved) return true;
    const { wsId, paths } = resolved;
    const name = decodeURIComponent(mcpByName[2]);
    try {
      json(res, 200, { workspace_id: wsId, ...getMcpServerDetail(name, mcpCrudOpts(paths)) });
    } catch (e) {
      json(res, 404, { error: e.message ?? String(e) });
    }
    return true;
  }
  if (mcpByName && (method === "PUT" || method === "DELETE")) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const resolved = resolveWorkspaceRequest(mcpByName[1], res);
    if (!resolved) return true;
    const { wsId, paths } = resolved;
    const name = decodeURIComponent(mcpByName[2]);
    try {
      if (method === "PUT") {
        const body = await readBody(req);
        const result = updateMcpServerConfig(name, body, mcpCrudOpts(paths));
        json(res, 200, { workspace_id: wsId, ...result });
      } else {
        const result = deleteMcpServer(name, mcpCrudOpts(paths));
        json(res, 200, { workspace_id: wsId, ...result });
      }
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return true;
  }

  const mcpPatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/mcps\/([^/]+)$/);
  if (method === "PATCH" && mcpPatch) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const resolved = resolveWorkspaceRequest(mcpPatch[1], res);
    if (!resolved) return true;
    const { wsId, paths } = resolved;
    const name = decodeURIComponent(mcpPatch[2]);
    const body = await readBody(req);
    if (typeof body.enabled !== "boolean") {
      json(res, 400, { error: "enabled (boolean) required" });
      return true;
    }
    try {
      const result = setMcpServerEnabled(name, body.enabled, {
        mcpPath: paths.mcpPath,
        disabledPath: paths.disabledPath,
        configPath: paths.configPath,
        globalConfigPath: paths.globalPaths?.configPath ?? defaultPaths().configPath,
      });
      json(res, 200, { ok: true, workspace_id: wsId, ...result });
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return true;
  }

  const wsBulkExclude = pathname.match(/^\/api\/workspaces\/([^/]+)\/tools\/bulk-exclude$/);
  if (method === "POST" && wsBulkExclude) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const resolved = resolveWorkspaceRequest(wsBulkExclude[1], res);
    if (!resolved) return true;
    const { wsId, paths } = resolved;
    await handleBulkExclude(req, res, paths.overridesPath, wsId);
    return true;
  }

  const toolPatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/tools\/([^/]+)$/);
  if (method === "PATCH" && toolPatch) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const resolved = resolveWorkspaceRequest(toolPatch[1], res);
    if (!resolved) return true;
    const { wsId, paths } = resolved;
    const name = decodeURIComponent(toolPatch[2]);
    const body = await readBody(req);
    try {
      const data = patchToolOverride(name, body, paths.overridesPath);
      json(res, 200, {
        ok: true,
        workspace_id: wsId,
        tool: name,
        force_tier: data.tools[name]?.force_tier ?? null,
        exclude_lock: Boolean(data.tools[name]?.exclude_lock),
        always_expose: Boolean(data.tools[name]?.always_expose),
        ...toolOverrideGateHints(body),
        overrides: data,
      });
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return true;
  }

  const wsSanitize = pathname.match(/^\/api\/workspaces\/([^/]+)\/shield-prompt\/sanitize$/);
  if (method === "POST" && wsSanitize) {
    const resolved = resolveWorkspaceRequest(wsSanitize[1], res);
    if (!resolved) return true;
    const { wsId, paths } = resolved;
    const body = await readBody(req);
    try {
      const result = sanitizePromptApiBody(body, { dir: paths.shieldPromptBlockDir });
      json(res, 200, { ok: true, workspace_id: wsId, ...result });
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return true;
  }

  const wsGateStatus = pathname.match(/^\/api\/workspaces\/([^/]+)\/gate\/status$/);
  if (method === "GET" && wsGateStatus) {
    const resolved = resolveWorkspaceRequest(wsGateStatus[1], res);
    if (!resolved) return true;
    const { paths } = resolved;
    json(res, 200, {
      workspace_id: resolved.wsId,
      ...buildGateStatusPayload(gateStatusOpts(paths)),
    });
    return true;
  }

  const wsMatch = pathname.match(
    /^\/api\/workspaces\/([^/]+)(?:\/(overview|tools|mcps|recommendations|overrides|marketplace|gate-settings|mcp-trust|shield-prompt|shield-settings))?$/
  );
  if (!wsMatch) {
    if (pathname.startsWith("/api/workspaces/")) {
      apiNotFound(res, pathname);
      return true;
    }
    return false;
  }

  const wsId = decodeURIComponent(wsMatch[1]);
  const section = wsMatch[2];
  let workspaceCtx;
  try {
    workspaceCtx = resolveWorkspace(wsId, { globalFallback: defaultPaths() });
  } catch (e) {
    json(res, 404, { error: e.message ?? String(e) });
    return true;
  }
  const paths = scopedDataOptions(workspaceCtx, dataOptions, controlPaths);

  if (method === "GET") {
    if (!section) {
      json(res, 200, {
        workspace: {
          id: wsId,
          path: workspaceCtx.projectRoot,
          paths: {
            config: paths.configPath,
            overrides: paths.overridesPath,
            usage: paths.usagePath,
            logs: paths.logDir,
            mcp: paths.mcpPath,
          },
        },
        ...buildDashboardData(paths),
      });
      return true;
    }
    const data = buildDashboardData(paths);
    if (section === "overview") json(res, 200, data.overview);
    else if (section === "tools") json(res, 200, await buildToolsPayload(paths));
    else if (section === "mcps") json(res, 200, data.mcps);
    else if (section === "recommendations") json(res, 200, data.recommendations);
    else if (section === "overrides") {
      json(res, 200, {
        path: paths.overridesPath,
        ...loadToolOverrides(paths.overridesPath),
      });
    } else if (section === "marketplace") {
      json(res, 200, marketplacePayload(url, paths, marketplaceDirPath));
    } else if (section === "gate-settings") {
      json(res, 200, buildGateSettingsApiPayload(gateSettingsOpts(paths)));
    } else if (section === "mcp-trust") {
      json(res, 200, buildMcpTrustApiPayload(mcpTrustOpts(paths)));
    } else if (section === "shield-prompt") {
      json(res, 200, buildShieldPromptApiPayload({ dir: paths.shieldPromptBlockDir }));
    } else if (section === "shield-settings") {
      json(res, 200, buildShieldSettingsApiPayload(defaultHooksPath()));
    } else {
      apiNotFound(res, pathname);
    }
    return true;
  }

  if (method === "POST" && section === "mcps") {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const body = await readBody(req);
    if (body.name && body.config) {
      try {
        const result = addMcpServerRaw(body, mcpCrudOpts(paths));
        json(res, 200, { ...result, workspace_id: wsId, workspace_path: paths.projectRoot });
      } catch (e) {
        json(res, 400, { error: e.message ?? String(e) });
      }
      return true;
    }
    if (!body.template) {
      json(res, 400, { error: "template or name+config required" });
      return true;
    }
    const result = addMcpFromTemplate(body.template, body.env ?? {}, {
      ...paths,
      marketplaceDir: marketplaceDirPath,
    });
    json(res, 200, { ...result, workspace_id: wsId, workspace_path: paths.projectRoot });
    return true;
  }

  const wsShieldPatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/shield-settings$/);
  if (method === "PATCH" && wsShieldPatch) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const body = await readBody(req);
    try {
      const result = patchShieldSettings(body.settings ?? body, defaultHooksPath());
      json(res, 200, {
        ...result,
        workspace_id: decodeURIComponent(wsShieldPatch[1]),
        ...buildShieldSettingsApiPayload(defaultHooksPath()),
      });
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return true;
  }

  const wsGatePatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/gate-settings$/);
  if (method === "PATCH" && wsGatePatch) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    let workspaceCtx;
    try {
      workspaceCtx = resolveWorkspace(decodeURIComponent(wsGatePatch[1]), {
        globalFallback: defaultPaths(),
      });
    } catch (e) {
      json(res, 404, { error: e.message ?? String(e) });
      return true;
    }
    const paths = scopedDataOptions(workspaceCtx, dataOptions, controlPaths);
    const body = await readBody(req);
    const result = patchGateSettings(body.settings ?? body, gateSettingsOpts(paths));
    json(res, 200, { ok: true, workspace_id: decodeURIComponent(wsGatePatch[1]), ...result });
    return true;
  }

  const wsTrustPatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/mcp-trust$/);
  if (method === "PATCH" && wsTrustPatch) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    let workspaceCtx;
    try {
      workspaceCtx = resolveWorkspace(decodeURIComponent(wsTrustPatch[1]), {
        globalFallback: defaultPaths(),
      });
    } catch (e) {
      json(res, 404, { error: e.message ?? String(e) });
      return true;
    }
    const paths = scopedDataOptions(workspaceCtx, dataOptions, controlPaths);
    const body = await readBody(req);
    try {
      const result = patchMcpTrust(body, mcpTrustPatchOpts(paths));
      json(res, 200, { ok: true, workspace_id: decodeURIComponent(wsTrustPatch[1]), ...result });
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return true;
  }

  if (pathname.startsWith("/api/workspaces/")) {
    apiNotFound(res, pathname);
    return true;
  }
  return false;
}

function toolOverrideGateHints(body) {
  const tierChange =
    body.force_tier !== undefined ||
    body.enabled !== undefined ||
    body.always_expose !== undefined;
  if (tierChange) {
    return { requires_gate_restart: false, gate_reload: "auto" };
  }
  return { requires_gate_restart: false };
}

async function handleBulkExclude(req, res, overridesPath, workspaceId = null) {
  const body = await readBody(req);
  const names = body.names;
  if (!Array.isArray(names) || names.length === 0) {
    json(res, 400, { error: "names (non-empty array) required" });
    return;
  }
  const result = bulkHideTools(names, overridesPath);
  const payload = {
    ok: true,
    hidden: result.hidden,
    skipped: result.skipped ?? [],
    count: result.count,
    tokens_saved:
      typeof body.tokens_saved === "number" && body.tokens_saved >= 0
        ? body.tokens_saved
        : null,
    requires_gate_restart: false,
    gate_reload: "auto",
    overrides: result.overrides,
  };
  if (workspaceId) payload.workspace_id = workspaceId;
  json(res, 200, payload);
}

function createDashboardServer(options = {}) {
  const dataOptions = options.dataOptions ?? {};
  const controlPaths = options.controlPaths ?? {};
  const marketplaceDirPath = resolveMarketplaceDir(controlPaths, dataOptions);
  const routeCtx = { dataOptions, controlPaths, marketplaceDirPath };

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const pathname = normalizePathname(url.pathname);
    const method = req.method ?? "GET";

    try {
      if (await handleWorkspaceRoute(method, pathname, url, req, res, routeCtx)) {
        return;
      }

      if (method === "GET") {
        if (pathname === "/api/health") {
          json(res, 200, {
            ...buildHealth({ writeTokenRequired: Boolean(WRITE_TOKEN) }),
            ui: buildUiSettingsApiPayload(),
          });
          return;
        }
        if (pathname === "/api/ui-settings") {
          json(res, 200, buildUiSettingsApiPayload());
          return;
        }
        if (pathname === "/api/overview") {
          json(res, 200, buildDashboardData(dataOptions).overview);
          return;
        }
        if (pathname === "/api/tools") {
          json(res, 200, await buildToolsPayload(dataOptions));
          return;
        }
        if (pathname === "/api/mcps") {
          json(res, 200, buildDashboardData(dataOptions).mcps);
          return;
        }
        if (pathname === "/api/recommendations") {
          json(res, 200, buildDashboardData(dataOptions).recommendations);
          return;
        }
        if (pathname === "/api/overrides") {
          json(res, 200, {
            path: controlPaths.overridesPath ?? toolOverridesPath(),
            ...loadToolOverrides(controlPaths.overridesPath),
          });
          return;
        }
        if (pathname === "/api/gate-settings") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          json(res, 200, buildGateSettingsApiPayload(gateSettingsOpts(paths)));
          return;
        }
        if (pathname === "/api/gate/status") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          json(res, 200, buildGateStatusPayload(gateStatusOpts(paths)));
          return;
        }
        if (pathname === "/api/mcp-trust") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          json(res, 200, buildMcpTrustApiPayload(mcpTrustOpts(paths)));
          return;
        }
        if (pathname === "/api/shield-prompt") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          json(res, 200, buildShieldPromptApiPayload({ dir: paths.shieldPromptBlockDir }));
          return;
        }
        if (pathname === "/api/shield-settings") {
          json(res, 200, buildShieldSettingsApiPayload(defaultHooksPath()));
          return;
        }
        if (pathname === "/api/marketplace") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          json(res, 200, marketplacePayload(url, paths, marketplaceDirPath));
          return;
        }
        const mcpDetail = pathname.match(/^\/api\/mcps\/([^/]+)$/);
        if (method === "GET" && mcpDetail) {
          const name = decodeURIComponent(mcpDetail[1]);
          try {
            const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
            json(res, 200, getMcpServerDetail(name, mcpCrudOpts(paths)));
          } catch (e) {
            json(res, 404, { error: e.message ?? String(e) });
          }
          return;
        }
        const mcpPreview = pathname.match(/^\/api\/mcps\/([^/]+)\/preview$/);
        if (mcpPreview) {
          const name = decodeURIComponent(mcpPreview[1]);
          json(
            res,
            200,
            previewMcpDisable(name, {
              mcpPath: controlPaths.mcpPath,
            })
          );
          return;
        }
        if (pathname.startsWith("/api/")) {
          apiNotFound(res, pathname);
          return;
        }
        serveStatic(pathname, res);
        return;
      }

      if (method === "POST") {
        if (pathname === "/api/shield-prompt/sanitize") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          const body = await readBody(req);
          try {
            const result = sanitizePromptApiBody(body, { dir: paths.shieldPromptBlockDir });
            json(res, 200, { ok: true, ...result });
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }

        if (!authorizeWrite(req)) {
          json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
          return;
        }

        if (pathname === "/api/mcps") {
          const body = await readBody(req);
          const paths = {
            ...defaultPaths(),
            ...dataOptions,
            ...controlPaths,
            marketplaceDir: marketplaceDirPath,
          };
          if (body.name && body.config) {
            try {
              const result = addMcpServerRaw(body, mcpCrudOpts(paths));
              json(res, 200, result);
            } catch (e) {
              json(res, 400, { error: e.message ?? String(e) });
            }
            return;
          }
          const template = body.template;
          if (!template) {
            json(res, 400, { error: "template or name+config required" });
            return;
          }
          const result = addMcpFromTemplate(template, body.env ?? {}, paths);
          json(res, 200, result);
          return;
        }

        if (pathname === "/api/tools/bulk-exclude") {
          await handleBulkExclude(
            req,
            res,
            controlPaths.overridesPath ?? toolOverridesPath()
          );
          return;
        }

        if (pathname.startsWith("/api/")) {
          apiNotFound(res, pathname);
          return;
        }
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      if (method === "PUT") {
        if (!authorizeWrite(req)) {
          json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
          return;
        }
        const mcpPut = pathname.match(/^\/api\/mcps\/([^/]+)$/);
        if (mcpPut) {
          const name = decodeURIComponent(mcpPut[1]);
          const body = await readBody(req);
          try {
            const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
            const result = updateMcpServerConfig(name, body, mcpCrudOpts(paths));
            json(res, 200, result);
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }
      }

      if (method === "DELETE") {
        if (!authorizeWrite(req)) {
          json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
          return;
        }
        const mcpDel = pathname.match(/^\/api\/mcps\/([^/]+)$/);
        if (mcpDel) {
          const name = decodeURIComponent(mcpDel[1]);
          try {
            const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
            const result = deleteMcpServer(name, mcpCrudOpts(paths));
            json(res, 200, result);
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }
      }

      if (method === "PATCH") {
        if (pathname === "/api/ui-settings") {
          const body = await readBody(req);
          try {
            const result = patchUiSettings(body);
            json(res, 200, { ok: true, ...buildUiSettingsApiPayload(), settings: result.settings });
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }

        if (!authorizeWrite(req)) {
          json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
          return;
        }

        const toolMatch = pathname.match(/^\/api\/tools\/([^/]+)$/);
        if (toolMatch) {
          const name = decodeURIComponent(toolMatch[1]);
          const body = await readBody(req);
          try {
            const data = patchToolOverride(
              name,
              body,
              controlPaths.overridesPath ?? toolOverridesPath()
            );
            json(res, 200, {
              ok: true,
              tool: name,
              force_tier: data.tools[name]?.force_tier ?? null,
              exclude_lock: Boolean(data.tools[name]?.exclude_lock),
              always_expose: Boolean(data.tools[name]?.always_expose),
              ...toolOverrideGateHints(body),
              overrides: data,
            });
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }

        const mcpMatch = pathname.match(/^\/api\/mcps\/([^/]+)$/);
        if (mcpMatch) {
          const name = decodeURIComponent(mcpMatch[1]);
          const body = await readBody(req);
          if (typeof body.enabled !== "boolean") {
            json(res, 400, { error: "enabled (boolean) required" });
            return;
          }
          try {
            const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
            const result = setMcpServerEnabled(name, body.enabled, {
              mcpPath: controlPaths.mcpPath,
              disabledPath: controlPaths.disabledPath,
              configPath: paths.configPath,
              globalConfigPath: defaultPaths().configPath,
            });
            json(res, 200, { ok: true, ...result });
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }

        if (pathname === "/api/gate-settings") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          const body = await readBody(req);
          const result = patchGateSettings(body.settings ?? body, gateSettingsOpts(paths));
          json(res, 200, { ok: true, ...result });
          return;
        }

        if (pathname === "/api/shield-settings") {
          const body = await readBody(req);
          try {
            const result = patchShieldSettings(body.settings ?? body, defaultHooksPath());
            json(res, 200, { ...result, ...buildShieldSettingsApiPayload(defaultHooksPath()) });
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }

        if (pathname === "/api/mcp-trust") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          const body = await readBody(req);
          try {
            const result = patchMcpTrust(body, mcpTrustPatchOpts(paths));
            json(res, 200, { ok: true, ...result });
          } catch (e) {
            json(res, 400, { error: e.message ?? String(e) });
          }
          return;
        }

        if (pathname.startsWith("/api/")) {
          apiNotFound(res, pathname);
          return;
        }
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(405);
      res.end("Method not allowed");
    } catch (err) {
      json(res, 500, { error: err.message ?? String(err) });
    }
  });
}

async function main() {
  if (HOST !== "127.0.0.1" && HOST !== "::1" && HOST !== "localhost") {
    console.error(
      `[dashboard] warning: binding to ${HOST} exposes local MCP data. Use 127.0.0.1 unless intentional.`
    );
  }

  if (await isDashboardFresh({ host: HOST, port: PORT })) {
    console.log(`CostGate Dashboard already running`);
    console.log(`  http://${HOST}:${PORT}`);
    process.exit(0);
  }

  const existing = await fetchDashboardHealth({ host: HOST, port: PORT, timeoutMs: 2000 });
  if (existing.ok) {
    console.error(`[dashboard] stale dashboard on port ${PORT} — restarting with current code`);
    await killProcessOnPort(PORT);
    await new Promise((r) => setTimeout(r, 300));
  }

  const server = createDashboardServer();
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[dashboard] port ${PORT} already in use (127.0.0.1:${PORT}).\n` +
          `  Another Dashboard may be running (e.g. Gate auto-start).\n` +
          `  Open http://${HOST}:${PORT} in your browser.\n` +
          `  To restart: free port ${PORT} (e.g. fuser -k ${PORT}/tcp) and run again.`
      );
      process.exit(1);
    }
    console.error("[dashboard]", err.message ?? err);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`CostGate Dashboard`);
    console.log(`  http://${HOST}:${PORT}`);
    if (WRITE_TOKEN) {
      console.log(`  writes require COSTGATE_DASHBOARD_TOKEN`);
    } else {
      console.log(`  writes enabled on localhost (set COSTGATE_DASHBOARD_TOKEN to protect)`);
    }
    console.log(`  Ctrl+C to stop`);
  });

  const shutdown = () => {
    clearDashboardBrowserOpenedFlag();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main();
}

export { createDashboardServer, HOST, PORT, UI_DIR, WRITE_TOKEN, normalizePathname };
