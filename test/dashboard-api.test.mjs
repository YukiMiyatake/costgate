#!/usr/bin/env node
/**
 * Phase 23: dashboard API snapshot tests (fixture-based, no live Gate).
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
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
  return {
    logDir,
    gateLogDir: logDir,
    usagePath: join(FIX, "usage.json"),
    configPath: join(FIX, "backends.json"),
    mcpPath: join(FIX, "mcp.json"),
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

  const listPR = data.tools.tools.find((t) => t.name === "list_pull_requests");
  assert(listPR?.call_count === 1, "gate tool_call should merge list_pull_requests");

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

    const tools = await fetchJson(port, "/api/tools");
    assert(Array.isArray(tools.tools), "tools array");
    assert(tools.blind_spots.includes("cursor-app-control"), "tools blind spots");

    const mcps = await fetchJson(port, "/api/mcps");
    assert(mcps.servers.some((s) => s.name === "costgate-gate"), "gate server");

    const recs = await fetchJson(port, "/api/recommendations");
    assert(recs.items.length >= 1, "recommendations");

    const marketplace = await fetchJson(port, "/api/marketplace");
    assert(Array.isArray(marketplace.templates), "marketplace templates");
    assert(marketplace.templates.length >= 3, "marketplace catalog");

    const html = await fetch(`http://127.0.0.1:${port}/`);
    assert(html.ok, "index html");
    const text = await html.text();
    assert(text.includes("CostGate Dashboard"), "html title");
    assert(text.includes("Add MCP"), "wizard tab");

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
