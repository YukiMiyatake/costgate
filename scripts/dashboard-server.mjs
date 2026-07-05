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
import { buildDashboardData, buildHealth } from "./lib/dashboard-data.mjs";
import {
  loadToolOverrides,
  setToolForceTier,
  setMcpServerEnabled,
  previewMcpDisable,
  toolOverridesPath,
} from "./lib/dashboard-control.mjs";
import {
  buildGateSettingsApiPayload,
  patchGateSettings,
} from "./lib/gate-settings.mjs";
import { buildMcpTrustApiPayload } from "./lib/mcp-trust.mjs";
import { searchMarketplace, addMcpFromTemplate, suggestAllowedPaths, buildCategorySummary, parseMarketplaceOptions, loadBackendsJson } from "./lib/dashboard-marketplace.mjs";
import { resolveEffectiveConfig } from "./lib/dashboard-config-merge.mjs";
import { defaultPaths } from "./lib/dashboard-data.mjs";
import {
  listWorkspaces,
  pinWorkspace,
  resolveWorkspace,
  registryPath,
} from "./lib/dashboard-workspaces.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = join(ROOT, "dashboard-ui");
const HOST = process.env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.COSTGATE_DASHBOARD_PORT ?? "8787");
const WRITE_TOKEN = process.env.COSTGATE_DASHBOARD_TOKEN ?? "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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

  const wsMatch = pathname.match(
    /^\/api\/workspaces\/([^/]+)(?:\/(overview|tools|mcps|recommendations|overrides|marketplace|gate-settings|mcp-trust))?$/
  );
  if (!wsMatch) return false;

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
    else if (section === "tools") json(res, 200, data.tools);
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
    if (!body.template) {
      json(res, 400, { error: "template required" });
      return true;
    }
    const result = addMcpFromTemplate(body.template, body.env ?? {}, {
      ...paths,
      marketplaceDir: marketplaceDirPath,
    });
    json(res, 200, { ...result, workspace_id: wsId, workspace_path: paths.projectRoot });
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

  const toolPatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/tools\/([^/]+)$/);
  if (method === "PATCH" && toolPatch) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const name = decodeURIComponent(toolPatch[2]);
    const body = await readBody(req);
    const forceTier =
      body.force_tier ??
      (body.enabled === false ? "hidden" : body.enabled === true ? "default" : null);
    if (!forceTier) {
      json(res, 400, { error: "force_tier or enabled required" });
      return true;
    }
    const data = setToolForceTier(name, forceTier, paths.overridesPath);
    json(res, 200, {
      ok: true,
      workspace_id: wsId,
      tool: name,
      force_tier: forceTier === "default" ? null : forceTier,
      requires_gate_restart: true,
      overrides: data,
    });
    return true;
  }

  const mcpPatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/mcps\/([^/]+)$/);
  if (method === "PATCH" && mcpPatch) {
    if (!authorizeWrite(req)) {
      json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
      return true;
    }
    const name = decodeURIComponent(mcpPatch[2]);
    const body = await readBody(req);
    if (typeof body.enabled !== "boolean") {
      json(res, 400, { error: "enabled (boolean) required" });
      return true;
    }
    const result = setMcpServerEnabled(name, body.enabled, {
      mcpPath: paths.mcpPath,
      disabledPath: paths.disabledPath,
    });
    json(res, 200, { ok: true, workspace_id: wsId, ...result });
    return true;
  }

  if (pathname.startsWith("/api/workspaces/")) {
    apiNotFound(res, pathname);
    return true;
  }
  return false;
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
          json(res, 200, buildHealth({ writeTokenRequired: Boolean(WRITE_TOKEN) }));
          return;
        }
        if (pathname === "/api/overview") {
          json(res, 200, buildDashboardData(dataOptions).overview);
          return;
        }
        if (pathname === "/api/tools") {
          json(res, 200, buildDashboardData(dataOptions).tools);
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
        if (pathname === "/api/mcp-trust") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          json(res, 200, buildMcpTrustApiPayload(mcpTrustOpts(paths)));
          return;
        }
        if (pathname === "/api/marketplace") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          json(res, 200, marketplacePayload(url, paths, marketplaceDirPath));
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
        if (!authorizeWrite(req)) {
          json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
          return;
        }

        if (pathname === "/api/mcps") {
          const body = await readBody(req);
          const template = body.template;
          if (!template) {
            json(res, 400, { error: "template required" });
            return;
          }
          const paths = {
            ...defaultPaths(),
            ...dataOptions,
            ...controlPaths,
            marketplaceDir: marketplaceDirPath,
          };
          const result = addMcpFromTemplate(template, body.env ?? {}, paths);
          json(res, 200, result);
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

      if (method === "PATCH") {
        if (!authorizeWrite(req)) {
          json(res, 401, { error: "unauthorized", hint: "Set X-Costgate-Dashboard-Token" });
          return;
        }

        const toolMatch = pathname.match(/^\/api\/tools\/([^/]+)$/);
        if (toolMatch) {
          const name = decodeURIComponent(toolMatch[1]);
          const body = await readBody(req);
          const forceTier = body.force_tier ?? (body.enabled === false ? "hidden" : body.enabled === true ? "default" : null);
          if (!forceTier) {
            json(res, 400, { error: "force_tier or enabled required" });
            return;
          }
          const data = setToolForceTier(
            name,
            forceTier,
            controlPaths.overridesPath ?? toolOverridesPath()
          );
          json(res, 200, {
            ok: true,
            tool: name,
            force_tier: forceTier === "default" ? null : forceTier,
            requires_gate_restart: true,
            overrides: data,
          });
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
          const result = setMcpServerEnabled(name, body.enabled, {
            mcpPath: controlPaths.mcpPath,
            disabledPath: controlPaths.disabledPath,
          });
          json(res, 200, { ok: true, ...result });
          return;
        }

        if (pathname === "/api/gate-settings") {
          const paths = { ...defaultPaths(), ...dataOptions, ...controlPaths };
          const body = await readBody(req);
          const result = patchGateSettings(body.settings ?? body, gateSettingsOpts(paths));
          json(res, 200, { ok: true, ...result });
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

function main() {
  if (HOST !== "127.0.0.1" && HOST !== "::1" && HOST !== "localhost") {
    console.error(
      `[dashboard] warning: binding to ${HOST} exposes local MCP data. Use 127.0.0.1 unless intentional.`
    );
  }

  const server = createDashboardServer();
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
}

const isMain =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main();
}

export { createDashboardServer, HOST, PORT, UI_DIR, WRITE_TOKEN, normalizePathname };
