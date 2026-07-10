#!/usr/bin/env node
/**
 * Phase 31a: MCP trust load/merge/resolve tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MCP_TRUST,
  loadMcpTrust,
  resolveServerTrust,
  enrichMcpsWithTrust,
  buildMcpTrustApiPayload,
  normalizeTrustConfig,
  patchMcpTrust,
  defaultTrustForMarketplaceInstall,
  applyMarketplaceInstallTrust,
  MCP_TRUST_LEVELS,
} from "../scripts/lib/mcp-trust.mjs";
import { buildDashboardData } from "../scripts/lib/dashboard-data.mjs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { writeAuthHeaders } from "./lib/dashboard-fetch.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MARKETPLACE = join(ROOT, "catalog/marketplace");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempRoot() {
  const dir = join(tmpdir(), `costgate-mcp-trust-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function testDefaults() {
  const cfg = normalizeTrustConfig();
  assert(cfg.defaults.direct_mcp === "restricted", "default direct_mcp");
  assert(cfg.servers["costgate-gate"]?.trust === "trusted", "builtin gate trust");
  console.error("[mcp-trust] defaults ok");
}

function testProjectMerge() {
  const base = tempRoot();
  const globalDir = join(base, "global");
  const projectRoot = join(base, "project");
  const projectDir = join(projectRoot, ".costgate");
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  writeFileSync(
    join(globalDir, "mcp-trust.json"),
    `${JSON.stringify({
      version: 1,
      servers: { github: { trust: "standard" } },
    })}\n`
  );
  writeFileSync(
    join(projectDir, "mcp-trust.json"),
    `${JSON.stringify({
      version: 1,
      servers: { github: { trust: "restricted" }, filesystem: { trust: "standard" } },
    })}\n`
  );

  const loaded = loadMcpTrust({
    globalPath: join(globalDir, "mcp-trust.json"),
    projectPath: join(projectDir, "mcp-trust.json"),
    projectRoot,
  });
  assert(loaded.config_merge === true, "merge flag");
  assert(loaded.config.servers.github.trust === "restricted", "project overrides global");
  assert(loaded.config.servers.filesystem.trust === "standard", "project-only server");
  assert(loaded.origins.servers.github === "project", "github origin");
  console.error("[mcp-trust] project merge ok");
}

function testResolveOrder() {
  const trust = loadMcpTrust({ globalPath: join(tempRoot(), "missing.json") });

  const gate = resolveServerTrust("costgate-gate", {
    trust,
    meta: { name: "costgate-gate", role: "gate", enabled: true },
  });
  assert(gate.trust === "trusted" && gate.resolved_from === "servers", "builtin gate");

  const builtin = resolveServerTrust("cursor-app-control", {
    trust,
    meta: { role: "direct", source: "mcp.json", enabled: true },
    marketplaceCatalog: [],
  });
  assert(builtin.trust === "standard" && builtin.resolved_from === "servers", "cursor builtin standard");

  const direct = resolveServerTrust("community-mcp", {
    trust,
    meta: { role: "direct", source: "mcp.json", enabled: true },
    marketplaceCatalog: [],
  });
  assert(direct.trust === "restricted" && direct.resolved_from === "direct_mcp", "direct default");

  const official = resolveServerTrust("github", {
    trust,
    meta: { role: "backend", enabled: true },
    marketplaceCatalog: [{ id: "github", backend_key: "github", official: true }],
  });
  assert(official.trust === "standard" && official.resolved_from === "marketplace_official", "official");

  const disabled = resolveServerTrust("stale-mcp", {
    trust,
    meta: { enabled: false },
  });
  assert(disabled.trust === "disabled", "disabled wins");
  console.error("[mcp-trust] resolve order ok");
}

function testEnrichMcps() {
  const servers = [
    { name: "costgate-gate", role: "gate", enabled: true },
    { name: "cursor-app-control", role: "direct", source: "mcp.json", enabled: true },
    { name: "github", role: "backend", enabled: true },
  ];
  const { servers: enriched, trust_summary } = enrichMcpsWithTrust(servers, {
    marketplaceDir: MARKETPLACE,
  });
  assert(enriched.find((s) => s.name === "costgate-gate")?.trust === "trusted", "gate enriched");
  assert(enriched.find((s) => s.name === "cursor-app-control")?.trust === "standard", "cursor builtin enriched");
  assert(enriched.find((s) => s.name === "github")?.trust === "standard", "github official");
  assert(trust_summary.restricted_or_below === 0, "restricted count");
  console.error("[mcp-trust] enrich ok");
}

function testBuildDashboardDataTrust() {
  const base = tempRoot();
  mkdirSync(join(base, "logs"), { recursive: true });
  writeFileSync(join(base, "backends.json"), '{"backends":{"github":{"command":"gh"}}}\n');
  writeFileSync(
    join(base, "mcp.json"),
    '{"mcpServers":{"costgate-gate":{"command":"gate"},"cursor-app-control":{"command":"cac"}}}\n'
  );
  writeFileSync(join(base, "usage.json"), '{"tools":{}}\n');

  const data = buildDashboardData({
    logDir: join(base, "logs"),
    gateLogDir: join(base, "logs"),
    usagePath: join(base, "usage.json"),
    configPath: join(base, "backends.json"),
    mcpPath: join(base, "mcp.json"),
    marketplaceDir: MARKETPLACE,
  });

  const gate = data.mcps.servers.find((s) => s.name === "costgate-gate");
  const blind = data.mcps.servers.find((s) => s.name === "cursor-app-control");
  assert(gate?.trust === "trusted", "dashboard gate trust");
  assert(blind?.trust === "standard", "dashboard cursor builtin trust");
  assert(data.overview.trust_restricted_count === 0, "overview trust count");
  assert(data.mcps.trust_summary?.restricted_or_below === 0, "mcps trust summary");
  console.error("[mcp-trust] buildDashboardData ok");
}

function testPatchGlobal() {
  const base = tempRoot();
  const trustPath = join(base, "mcp-trust.json");
  patchMcpTrust({ server: "github", trust: "restricted" }, { globalPath: trustPath });
  const loaded = loadMcpTrust({ globalPath: trustPath });
  assert(loaded.config.servers.github.trust === "restricted", "patched global server");
  console.error("[mcp-trust] patch global ok");
}

function testPatchProjectScoped() {
  const base = tempRoot();
  const globalDir = join(base, "global");
  const projectRoot = join(base, "project");
  const projectDir = join(projectRoot, ".costgate");
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  writeFileSync(
    join(globalDir, "mcp-trust.json"),
    `${JSON.stringify({
      version: 1,
      servers: { github: { trust: "standard" } },
    })}\n`
  );

  patchMcpTrust(
    { server: "github", trust: "untrusted" },
    {
      globalPath: join(globalDir, "mcp-trust.json"),
      projectPath: join(projectDir, "mcp-trust.json"),
      projectRoot,
      scoped: true,
    }
  );

  const loaded = loadMcpTrust({
    globalPath: join(globalDir, "mcp-trust.json"),
    projectPath: join(projectDir, "mcp-trust.json"),
    projectRoot,
  });
  assert(loaded.config.servers.github.trust === "untrusted", "project override after patch");
  assert(loaded.origins.servers.github === "project", "origin project after patch");
  console.error("[mcp-trust] patch project scoped ok");
}

function testPatchValidation() {
  let threw = false;
  try {
    patchMcpTrust({ server: "x", trust: "bogus" }, { globalPath: join(tempRoot(), "t.json") });
  } catch (e) {
    threw = e.message.includes("invalid trust");
  }
  assert(threw, "reject invalid trust");
  console.error("[mcp-trust] patch validation ok");
}

async function testHttpApi() {
  const base = tempRoot();
  mkdirSync(join(base, "logs"), { recursive: true });
  writeFileSync(join(base, "backends.json"), '{"backends":{}}\n');
  writeFileSync(join(base, "mcp.json"), '{"mcpServers":{"costgate-gate":{"command":"gate"}}}\n');
  writeFileSync(
    join(base, "mcp-trust.json"),
    `${JSON.stringify({
      version: 1,
      servers: { "costgate-gate": { trust: "trusted", source: "config" } },
    })}\n`
  );

  const server = createDashboardServer({
    dataOptions: {
      logDir: join(base, "logs"),
      usagePath: join(base, "usage.json"),
      configPath: join(base, "backends.json"),
      mcpPath: join(base, "mcp.json"),
      trustPath: join(base, "mcp-trust.json"),
      marketplaceDir: MARKETPLACE,
    },
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const trust = await fetch(`${baseUrl}/api/mcp-trust`).then((r) => r.json());
    assert(trust.read_only === false, "editable flag");
    assert(trust.levels?.includes("restricted"), "levels list");
    assert(trust.servers["costgate-gate"]?.trust === "trusted", "GET mcp-trust");

    const patch = await fetch(`${baseUrl}/api/mcp-trust`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ server: "costgate-gate", trust: "standard" }),
    });
    assert(patch.ok, `PATCH ${patch.status}`);
    const patched = await patch.json();
    assert(patched.config.servers["costgate-gate"].trust === "standard", "PATCH response");

    const again = await fetch(`${baseUrl}/api/mcp-trust`).then((r) => r.json());
    assert(again.servers["costgate-gate"]?.trust === "standard", "PATCH persisted");

    const bad = await fetch(`${baseUrl}/api/mcp-trust`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ server: "x", trust: "invalid" }),
    });
    assert(bad.status === 400, "invalid trust 400");

    const mcps = await fetch(`${baseUrl}/api/mcps`).then((r) => r.json());
    const gate = mcps.servers?.find((s) => s.name === "costgate-gate");
    assert(gate?.trust === "standard", "mcps embed patched trust");
    assert(mcps.trust_summary != null, "mcps trust_summary");

    const payload = buildMcpTrustApiPayload({ globalPath: join(base, "mcp-trust.json") });
    assert(payload.defaults.gate_backend === DEFAULT_MCP_TRUST.defaults.gate_backend, "api defaults");
    console.error("[mcp-trust] HTTP API ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function testMarketplaceInstallTrust() {
  assert(defaultTrustForMarketplaceInstall({ official: true }) === "standard", "official → standard");
  assert(defaultTrustForMarketplaceInstall({ official: false }) === "restricted", "community → restricted");
  assert(defaultTrustForMarketplaceInstall({}) === "restricted", "missing official → restricted");

  const base = tempRoot();
  const trustPath = join(base, "mcp-trust.json");
  applyMarketplaceInstallTrust(
    "github",
    { id: "github", backend_key: "github", official: true },
    { trustPath }
  );
  const official = loadMcpTrust({ globalPath: trustPath });
  assert(official.config.servers.github.trust === "standard", "install official trust");
  assert(official.config.servers.github.source === "marketplace", "install source");

  applyMarketplaceInstallTrust(
    "slack",
    { id: "slack", backend_key: "slack", official: false },
    { trustPath }
  );
  const community = loadMcpTrust({ globalPath: trustPath });
  assert(community.config.servers.slack.trust === "restricted", "install community trust");
  console.error("[mcp-trust] marketplace install defaults ok");
}

async function main() {
  testDefaults();
  testProjectMerge();
  testResolveOrder();
  testEnrichMcps();
  testBuildDashboardDataTrust();
  testMarketplaceInstallTrust();
  testPatchGlobal();
  testPatchProjectScoped();
  testPatchValidation();
  assert(MCP_TRUST_LEVELS.length === 4, "four trust levels");
  await testHttpApi();
  console.error("[mcp-trust] all passed");
}

main().catch((e) => {
  console.error("[mcp-trust] fatal:", e);
  process.exit(1);
});
