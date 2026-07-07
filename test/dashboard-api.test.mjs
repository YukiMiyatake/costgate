#!/usr/bin/env node
/**
 * Phase 23: dashboard API snapshot tests (fixture-based, no live Gate).
 */
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { buildDashboardData } from "../scripts/lib/dashboard-data.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIX = join(ROOT, "test/fixtures/dashboard");

function fixtureOptions(now) {
  const logDir = join(FIX, ".generated-logs");
  mkdirSync(logDir, { recursive: true });
  copyFileSync(
    join(FIX, "probe-sample.jsonl"),
    join(logDir, "probe-fixture.jsonl")
  );
  copyFileSync(
    join(FIX, "gate-sample.jsonl"),
    join(logDir, "gate-fixture.jsonl")
  );
  const promptIntentDir = join(tmpdir(), `costgate-dash-pi-${process.pid}`);
  mkdirSync(promptIntentDir, { recursive: true });
  writeFileSync(
    join(promptIntentDir, "latest.json"),
    `${JSON.stringify({
      keywords: "github pull merge",
      templates: ["github"],
      sources: ["prompt"],
      ts: now - 30_000,
      conversation_id: "conv-fixture",
    })}\n`
  );
  return {
    logDir,
    gateLogDir: logDir,
    usagePath: join(FIX, "usage.json"),
    configPath: join(FIX, "backends.json"),
    mcpPath: join(FIX, "mcp.json"),
    promptIntentDir,
    windowDays: 30,
    now,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function fetchJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  assert(res.ok, `${path} status ${res.status}`);
  return res.json();
}

async function testBuildData() {
  const now = Date.parse("2026-07-05T12:00:00.000Z");
  const data = buildDashboardData(fixtureOptions(now));

  assert(data.overview.sessions === 2, "expected 2 sessions");
  assert(data.overview.tool_calls >= 4, "expected merged probe+gate tool_calls");
  assert(data.overview.tool_count >= 4, "expected at least 4 tools");
  assert(data.mcps.blind_spots.includes("cursor-app-control"), "blind spot missing");
  assert(data.mcps.mode === "production", "expected production mode");
  assert(
    data.recommendations.items.some((r) => r.reason === "stale_90d"),
    "expected stale_90d recommendation"
  );

  const fork = data.tools.tools.find((t) => t.name === "fork_repository");
  assert(fork?.recommendation === "stale_90d", "fork_repository should be stale_90d");
  assert(typeof fork?.exclude_score === "number" && fork.exclude_score >= 65, "exclude_score set");

  const listPR = data.tools.tools.find((t) => t.name === "list_pull_requests");
  assert(listPR?.call_count === 1, "gate tool_call should merge list_pull_requests");

  assert(data.overview.prompt_intent?.keywords.includes("github"), "prompt intent in overview");
  assert(data.overview.prompt_intent.stale === false, "prompt intent fresh");

  console.error("[dashboard] buildDashboardData ok");
  return data;
}

async function testHttpApi() {
  const now = Date.parse("2026-07-05T12:00:00.000Z");
  const server = createDashboardServer({
    dataOptions: fixtureOptions(now),
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;

  try {
    const health = await fetchJson(port, "/api/health");
    assert(health.read_only === false, "phase24 allows writes on localhost");
    assert(health.status === "ok", "health ok");

    const overview = await fetchJson(port, "/api/overview");
    assert(overview.sessions === 2, "overview sessions");
    assert(overview.prompt_intent?.keywords, "overview prompt_intent");

    const tools = await fetchJson(port, "/api/tools");
    assert(Array.isArray(tools.tools), "tools array");
    assert(tools.blind_spots.includes("cursor-app-control"), "tools blind spots");

    const mcps = await fetchJson(port, "/api/mcps");
    assert(mcps.servers.some((s) => s.name === "costgate-gate"), "gate server");

    const recs = await fetchJson(port, "/api/recommendations");
    assert(recs.items.length >= 1, "recommendations");
    assert(Array.isArray(recs.signals_detected), "signals_detected array");
    assert(typeof recs.project_root === "string", "project_root string");

    const marketplace = await fetchJson(port, "/api/marketplace");
    assert(Array.isArray(marketplace.templates), "marketplace templates");
    assert(marketplace.templates.length >= 3, "marketplace catalog");
    assert(marketplace.catalog_available === true, "marketplace catalog_available");

    const marketplaceSearch = await fetchJson(port, "/api/marketplace?q=browser");
    assert(marketplaceSearch.templates.some((t) => t.id === "browser"), "marketplace search");

    const marketplaceSlash = await fetchJson(port, "/api/marketplace/");
    assert(Array.isArray(marketplaceSlash.templates), "marketplace trailing slash");

    const shield = await fetchJson(port, "/api/shield-prompt");
    assert(typeof shield.block_count === "number", "shield-prompt payload");

    const html = await fetch(`http://127.0.0.1:${port}/`);
    assert(html.ok, "index html");
    const text = await html.text();
    assert(text.includes("CostGate Dashboard"), "html title");
    assert(text.includes("Add MCP"), "wizard tab");
    assert(text.includes("shield-prompt-panel"), "shield prompt UI");

    console.error("[dashboard] HTTP API ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  await testBuildData();
  await testHttpApi();
  console.error("[dashboard] all passed");
}

main().catch((e) => {
  console.error("[dashboard] fatal:", e);
  process.exit(1);
});
