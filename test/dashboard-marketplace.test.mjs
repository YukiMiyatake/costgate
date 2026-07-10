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
  buildCategorySummary,
  parseMarketplaceOptions,
} from "../scripts/lib/dashboard-marketplace.mjs";
import { loadMcpTrust } from "../scripts/lib/mcp-trust.mjs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { writeAuthHeaders } from "./lib/dashboard-fetch.mjs";

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
  assert(items.length >= 15, `expected at least 15 marketplace templates, got ${items.length}`);
  assert(items.some((t) => t.id === "github"), "github template missing");
  assert(items.some((t) => t.id === "filesystem"), "filesystem template missing");
  assert(items.some((t) => t.id === "browser"), "browser template missing");
  assert(items.some((t) => t.id === "postgres"), "postgres template missing");
  assert(items.some((t) => t.id === "playwright"), "playwright template missing");
  console.error("[marketplace] catalog load ok");
}

function testCategoriesAndFilters() {
  const all = searchMarketplace("", MARKETPLACE);
  const cats = buildCategorySummary(all);
  assert(cats.length >= 5, "expected multiple categories");
  assert(cats.some((c) => c.id === "database" && c.count >= 2), "database category");

  const db = searchMarketplace({ category: "database" }, MARKETPLACE);
  assert(db.length >= 2, "database filter");
  assert(db.every((t) => t.category === "database"), "all database");

  const official = searchMarketplace({ official_only: true }, MARKETPLACE);
  assert(official.length >= 5, "official filter");
  assert(official.every((t) => t.official === true), "all official");

  const noSecrets = searchMarketplace({ hide_secrets: true }, MARKETPLACE);
  assert(noSecrets.every((t) => !t.requires_secrets), "no secret templates");

  const sorted = searchMarketplace({ sort: "reduction" }, MARKETPLACE);
  assert(sorted.length >= 15, "sort reduction");
  assert(
    (sorted[0].compare_estimate?.reduction_pct ?? 0) >=
      (sorted[sorted.length - 1].compare_estimate?.reduction_pct ?? 0),
    "reduction sort order"
  );

  const pub = all[0];
  assert(pub.category_label, "category_label present");
  assert(typeof pub.official === "boolean", "official flag");
  assert(typeof pub.gate_ready === "boolean", "gate_ready flag");

  console.error("[marketplace] categories/filters ok");
}

function testSearch() {
  const all = searchMarketplace("", MARKETPLACE);
  assert(all.length >= 15, "search all");

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
  const trustPath = join(dir, "mcp-trust.json");
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const result = addMcpFromTemplate(
    "github",
    { GITHUB_TOKEN: "ghp_test_token" },
    { configPath, marketplaceDir: MARKETPLACE, trustPath }
  );

  assert(result.ok === true, "add ok");
  assert(result.backend === "github", "backend key");
  assert(result.trust === "standard", "official install trust");
  assert(result.trust_path === trustPath, "trust path");
  assert(result.compare_estimate?.reduction_pct > 0, "compare estimate");
  assert(result.backups.backends?.endsWith(".bak"), "backends backup");

  const saved = JSON.parse(readFileSync(configPath, "utf8"));
  assert(saved.backends.github.command === "npx", "command written");
  assert(
    saved.backends.github.env.GITHUB_PERSONAL_ACCESS_TOKEN === "ghp_test_token",
    "env mapped"
  );

  const trust = loadMcpTrust({ globalPath: trustPath });
  assert(trust.config.servers.github.trust === "standard", "github trust persisted");
  assert(trust.config.servers.github.source === "marketplace", "github trust source");

  let threw = false;
  try {
    addMcpFromTemplate("github", { GITHUB_TOKEN: "x" }, { configPath, marketplaceDir: MARKETPLACE });
  } catch (e) {
    threw = e.message.includes("already exists");
  }
  assert(threw, "duplicate backend rejected");

  console.error("[marketplace] add github ok");
}

function testAddCommunityBackendTrust() {
  const dir = tempDir();
  const configPath = join(dir, "backends.json");
  const trustPath = join(dir, "mcp-trust.json");
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const result = addMcpFromTemplate(
    "slack",
    { SLACK_BOT_TOKEN: "xoxb-test" },
    { configPath, marketplaceDir: MARKETPLACE, trustPath }
  );

  assert(result.trust === "restricted", "community install trust");
  const trust = loadMcpTrust({ globalPath: trustPath });
  assert(trust.config.servers.slack.trust === "restricted", "slack trust persisted");
  console.error("[marketplace] add community trust ok");
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
    assert(list.catalog_count >= 15, "catalog_count");
    assert(Array.isArray(list.categories) && list.categories.length >= 5, "categories");

    const db = await fetch(`${base}/api/marketplace?category=database`).then((r) => r.json());
    assert(db.templates?.length >= 2, "category=database");
    assert(db.templates.every((t) => t.category === "database"), "database templates only");

    const slash = await fetch(`${base}/api/marketplace/`).then((r) => r.json());
    assert(slash.templates?.length >= 1, "marketplace trailing slash");
    assert(Array.isArray(slash.path_candidates), "path_candidates array");
    assert(slash.path_candidates.length >= 1, "path_candidates non-empty");

    const post = await fetch(`${base}/api/mcps`, {
      method: "POST",
      headers: writeAuthHeaders("POST"),
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

    const installed = await fetch(`${base}/api/marketplace?q=github`).then((r) => r.json());
    assert(installed.templates.some((t) => t.id === "github" && t.installed === true), "installed flag");

    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert(health.version === "31a", "dashboard health version");

    console.error("[marketplace] HTTP API ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testCatalogLoad();
  testCategoriesAndFilters();
  testSearch();
  testPathSuggestions();
  testAddGithubBackend();
  testAddCommunityBackendTrust();
  testAddFilesystemBackend();
  testAddBuiltinBrowser();
  await testHttpMarketplaceAndPost();
  console.error("[marketplace] all passed");
}

main().catch((e) => {
  console.error("[marketplace] fatal:", e);
  process.exit(1);
});
