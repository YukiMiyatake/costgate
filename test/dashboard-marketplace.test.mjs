#!/usr/bin/env node
/**
 * Phase 26: marketplace catalog + MCP add wizard tests.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  searchMarketplace,
  addMcpFromTemplate,
  loadMarketplaceCatalog,
  suggestAllowedPaths,
} from "../scripts/lib/dashboard-marketplace.mjs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MARKETPLACE = join(ROOT, "catalog/marketplace");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const dir = join(tmpdir(), `costgate-marketplace-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function testCatalogLoad() {
  const items = loadMarketplaceCatalog(MARKETPLACE);
  assert(items.length >= 3, "expected at least 3 marketplace templates");
  assert(items.some((t) => t.id === "github"), "github template missing");
  assert(items.some((t) => t.id === "filesystem"), "filesystem template missing");
  assert(items.some((t) => t.id === "browser"), "browser template missing");
  console.error("[marketplace] catalog load ok");
}

function testSearch() {
  const all = searchMarketplace("", MARKETPLACE);
  assert(all.length >= 3, "search all");

  const browser = searchMarketplace("browser", MARKETPLACE);
  assert(browser.length >= 1, "browser search");
  assert(browser[0].id === "browser", "browser first");

  const gh = searchMarketplace("GITHUB", MARKETPLACE);
  assert(gh.some((t) => t.id === "github"), "case-insensitive github");

  const none = searchMarketplace("zzznomatch", MARKETPLACE);
  assert(none.length === 0, "no match");

  const pub = browser[0];
  assert(!("backend_template" in pub), "public template hides backend_template");
  assert(pub.compare_estimate?.before_tokens > 0, "compare estimate present");

  console.error("[marketplace] search ok");
}

function testPathSuggestions() {
  const hints = suggestAllowedPaths({ projectRoot: ROOT });
  assert(hints.project_root === resolve(ROOT), "project_root resolved");
  assert(hints.candidates.length >= 1, "at least one candidate");
  assert(hints.candidates.some((c) => c.path === resolve(ROOT)), "repo root as candidate");
  console.error("[marketplace] path suggestions ok");
}

function testAddGithubBackend() {
  const dir = tempDir();
  const configPath = join(dir, "backends.json");
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const result = addMcpFromTemplate(
    "github",
    { GITHUB_TOKEN: "ghp_test_token" },
    { configPath, marketplaceDir: MARKETPLACE }
  );

  assert(result.ok === true, "add ok");
  assert(result.backend === "github", "backend key");
  assert(result.compare_estimate?.reduction_pct > 0, "compare estimate");
  assert(result.backups.backends?.endsWith(".bak"), "backends backup");

  const saved = JSON.parse(readFileSync(configPath, "utf8"));
  assert(saved.backends.github.command === "npx", "command written");
  assert(
    saved.backends.github.env.GITHUB_PERSONAL_ACCESS_TOKEN === "ghp_test_token",
    "env mapped"
  );

  let threw = false;
  try {
    addMcpFromTemplate("github", { GITHUB_TOKEN: "x" }, { configPath, marketplaceDir: MARKETPLACE });
  } catch (e) {
    threw = e.message.includes("already exists");
  }
  assert(threw, "duplicate backend rejected");

  console.error("[marketplace] add github ok");
}

function testAddFilesystemBackend() {
  const dir = tempDir();
  const configPath = join(dir, "backends.json");
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const result = addMcpFromTemplate(
    "filesystem",
    { ALLOWED_PATH: "/tmp/project" },
    { configPath, marketplaceDir: MARKETPLACE }
  );

  assert(result.backend === "filesystem", "filesystem backend");
  const saved = JSON.parse(readFileSync(configPath, "utf8"));
  assert(saved.backends.filesystem.args.includes("/tmp/project"), "path in args");

  console.error("[marketplace] add filesystem ok");
}

function testAddBuiltinBrowser() {
  const dir = tempDir();
  const configPath = join(dir, "backends.json");
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const result = addMcpFromTemplate("browser", {}, {
    configPath,
    marketplaceDir: MARKETPLACE,
  });

  assert(result.hint?.includes("Cursor"), "builtin hint");
  assert(result.backend === null, "no backend write");
  const saved = JSON.parse(readFileSync(configPath, "utf8"));
  assert(Object.keys(saved.backends).length === 0, "backends unchanged");

  console.error("[marketplace] builtin browser ok");
}

async function testHttpMarketplaceAndPost() {
  const dir = tempDir();
  const configPath = join(dir, "backends.json");
  const mcpPath = join(dir, "mcp.json");
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: { "costgate-gate": { command: "gate" } } }, null, 2));

  const server = createDashboardServer({
    dataOptions: {
      logDir: join(dir, "logs"),
      usagePath: join(dir, "usage.json"),
      configPath,
      mcpPath,
      windowDays: 30,
    },
    controlPaths: {
      configPath,
      mcpPath,
      marketplaceDir: MARKETPLACE,
    },
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const list = await fetch(`${base}/api/marketplace?q=github`).then((r) => r.json());
    assert(list.templates?.length >= 1, "marketplace GET");
    assert(list.query === "github", "query echoed");
    assert(list.catalog_available === true, "catalog_available");

    const slash = await fetch(`${base}/api/marketplace/`).then((r) => r.json());
    assert(slash.templates?.length >= 1, "marketplace trailing slash");
    assert(Array.isArray(slash.path_candidates), "path_candidates array");
    assert(slash.path_candidates.length >= 1, "path_candidates non-empty");

    const post = await fetch(`${base}/api/mcps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "github",
        env: { GITHUB_TOKEN: "ghp_http_test" },
      }),
    });
    assert(post.ok, `POST status ${post.status}`);
    const body = await post.json();
    assert(body.ok === true, "POST ok");
    assert(body.backend === "github", "POST backend");
    assert(body.compare_estimate?.after_tokens > 0, "POST compare_estimate");

    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert(health.version === "phase27", "phase27 health");

    console.error("[marketplace] HTTP API ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testCatalogLoad();
  testSearch();
  testPathSuggestions();
  testAddGithubBackend();
  testAddFilesystemBackend();
  testAddBuiltinBrowser();
  await testHttpMarketplaceAndPost();
  console.error("[marketplace] all passed");
}

main().catch((e) => {
  console.error("[marketplace] fatal:", e);
  process.exit(1);
});
