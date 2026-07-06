#!/usr/bin/env node
/**
 * Dashboard HTTP route matrix — catches 404 regressions (e.g. marketplace search).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  createDashboardServer,
  normalizePathname,
} from "../scripts/dashboard-server.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MARKETPLACE = join(ROOT, "catalog/marketplace");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempFixture() {
  const dir = join(tmpdir(), `costgate-routes-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "backends.json"), JSON.stringify({ backends: {} }, null, 2));
  writeFileSync(join(dir, "mcp.json"), JSON.stringify({ mcpServers: {} }, null, 2));
  mkdirSync(join(dir, "logs"), { recursive: true });
  return dir;
}

function testNormalizePathname() {
  assert(normalizePathname("/api/marketplace/") === "/api/marketplace", "strip trailing slash");
  assert(normalizePathname("/") === "/", "keep root");
  assert(normalizePathname("/api/tools") === "/api/tools", "unchanged");
  console.error("[routes] normalizePathname ok");
}

async function startServer(extra = {}) {
  const dir = tempFixture();
  const server = createDashboardServer({
    dataOptions: {
      logDir: join(dir, "logs"),
      usagePath: join(dir, "usage.json"),
      configPath: join(dir, "backends.json"),
      mcpPath: join(dir, "mcp.json"),
      marketplaceDir: MARKETPLACE,
      windowDays: 30,
      ...extra.dataOptions,
    },
    controlPaths: {
      configPath: join(dir, "backends.json"),
      mcpPath: join(dir, "mcp.json"),
      marketplaceDir: MARKETPLACE,
      ...extra.controlPaths,
    },
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  return {
    server,
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function expectJson(base, path, { status = 200, method = "GET", body, headers } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  assert(res.status === status, `${method} ${path} expected ${status}, got ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return null;
}

async function testGetRoutes() {
  const { base, close } = await startServer();
  try {
    const getRoutes = [
      "/api/health",
      "/api/overview",
      "/api/tools",
      "/api/mcps",
      "/api/recommendations",
      "/api/overrides",
      "/api/gate-settings",
      "/api/mcp-trust",
      "/api/shield-prompt",
      "/api/marketplace",
      "/api/marketplace?q=browser",
      "/api/marketplace?q=github",
      "/api/marketplace?q=zzznomatch",
      "/api/marketplace/",
    ];
    for (const path of getRoutes) {
      await expectJson(base, path, { status: 200 });
    }

    const marketplace = await expectJson(base, "/api/marketplace?q=browser");
    assert(marketplace.catalog_available === true, "catalog_available");
    assert(marketplace.templates.length >= 1, "browser search results");
    assert(marketplace.query === "browser", "query echoed");

    const trailing = await expectJson(base, "/api/marketplace/");
    assert(Array.isArray(trailing.templates), "trailing slash marketplace");

    const unknown = await expectJson(base, "/api/compare", { status: 404 });
    assert(unknown.error === "not_found", "unknown api json 404");

    for (const path of ["/", "/app.js", "/style.css"]) {
      const res = await fetch(`${base}${path}`);
      assert(res.ok, `static ${path} ${res.status}`);
    }

    console.error("[routes] GET routes ok");
  } finally {
    await close();
  }
}

async function testPostAndPatch() {
  const { base, close } = await startServer();
  try {
    const post = await expectJson(base, "/api/mcps", {
      method: "POST",
      body: { template: "github", env: { GITHUB_TOKEN: "ghp_route_test" } },
    });
    assert(post.ok === true, "POST add mcp");

    const dup = await fetch(`${base}/api/mcps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "github", env: { GITHUB_TOKEN: "x" } }),
    });
    assert(dup.status === 500, "duplicate backend should error");

    const patch = await expectJson(base, "/api/tools/create_issue", {
      method: "PATCH",
      body: { force_tier: "hidden" },
    });
    assert(patch.ok === true, "PATCH tool");

    const sanitize = await expectJson(base, "/api/shield-prompt/sanitize", {
      method: "POST",
      body: { text: "token ghp_abcdefghijklmnopqrstuvwxyz123456" },
    });
    assert(sanitize.ok === true, "POST sanitize");
    assert(sanitize.sanitized.includes("[[CG:"), "sanitized placeholder");

    const badMethod = await fetch(`${base}/api/marketplace`, { method: "PUT" });
    assert(badMethod.status === 405, "PUT marketplace 405");

    console.error("[routes] POST/PATCH ok");
  } finally {
    await close();
  }
}

async function testMissingCatalog() {
  const missing = join(tmpdir(), `costgate-no-catalog-${process.pid}-${Date.now()}-missing`);
  const { base, close } = await startServer({
    dataOptions: { marketplaceDir: missing },
    controlPaths: { marketplaceDir: missing },
  });
  try {
    const data = await expectJson(base, "/api/marketplace?q=github");
    assert(data.catalog_available === false, "missing catalog flagged");
    assert(data.templates.length === 0, "empty templates when catalog missing");
    console.error("[routes] missing catalog ok");
  } finally {
    await close();
  }
}

async function main() {
  testNormalizePathname();
  await testGetRoutes();
  await testPostAndPatch();
  await testMissingCatalog();
  console.error("[routes] all passed");
}

main().catch((e) => {
  console.error("[routes] fatal:", e);
  process.exit(1);
});
