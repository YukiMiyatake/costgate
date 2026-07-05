#!/usr/bin/env node
/**
 * Phase 23: read-only local dashboard (localhost only).
 *
 * Usage:
 *   npm run dashboard
 *   COSTGATE_DASHBOARD_PORT=9000 npm run dashboard
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDashboardData, buildHealth } from "./lib/dashboard-data.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = join(ROOT, "dashboard-ui");
const HOST = process.env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.COSTGATE_DASHBOARD_PORT ?? "8787");

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

function createDashboardServer(options = {}) {
  const dataOptions = options.dataOptions ?? {};

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const { pathname } = url;

    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }

    if (pathname === "/api/health") {
      json(res, 200, buildHealth());
      return;
    }
    if (pathname === "/api/overview") {
      const data = buildDashboardData(dataOptions);
      json(res, 200, data.overview);
      return;
    }
    if (pathname === "/api/tools") {
      const data = buildDashboardData(dataOptions);
      json(res, 200, data.tools);
      return;
    }
    if (pathname === "/api/mcps") {
      const data = buildDashboardData(dataOptions);
      json(res, 200, data.mcps);
      return;
    }
    if (pathname === "/api/recommendations") {
      const data = buildDashboardData(dataOptions);
      json(res, 200, data.recommendations);
      return;
    }

    serveStatic(pathname, res);
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
    console.log(`CostGate Dashboard (read-only)`);
    console.log(`  http://${HOST}:${PORT}`);
    console.log(`  Ctrl+C to stop`);
  });
}

const isMain =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main();
}

export { createDashboardServer, HOST, PORT, UI_DIR };
