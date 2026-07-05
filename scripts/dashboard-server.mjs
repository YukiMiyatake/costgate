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

function createDashboardServer(options = {}) {
  const dataOptions = options.dataOptions ?? {};
  const controlPaths = options.controlPaths ?? {};

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const { pathname } = url;
    const method = req.method ?? "GET";

    try {
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
        serveStatic(pathname, res);
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
          const data = setToolForceTier(name, forceTier, controlPaths.overridesPath);
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

export { createDashboardServer, HOST, PORT, UI_DIR, WRITE_TOKEN };
