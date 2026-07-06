#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  probeOneBackend,
  ensureBackendToolsCache,
  mergeBackendToolsCache,
  backendsNeedingProbe,
  prepareProbeConfig,
  isSerenaBackend,
  isBackendCacheStale,
  isBackendCacheMissing,
} from "../scripts/lib/dashboard-backend-probe.mjs";
import { buildDashboardData, buildToolsPayload } from "../scripts/lib/dashboard-data.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MOCK_MCP = join(ROOT, "test/fixtures/mock-mcp/index.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testPrepareProbeConfig() {
  const serena = {
    command: "uvx",
    args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "ide"],
  };
  assert(isSerenaBackend("serena", serena), "detect serena backend");
  const prepared = prepareProbeConfig("serena", serena);
  assert(
    prepared.args.includes("--open-web-dashboard") &&
      prepared.args.includes("false") &&
      prepared.args.includes("--enable-gui-log-window"),
    "serena probe adds no-browser flags"
  );
  const unchanged = prepareProbeConfig("github", { command: "npx", args: ["-y", "github"] });
  assert(!unchanged.args.includes("--open-web-dashboard"), "non-serena unchanged");
  console.error("[backend-probe] prepareProbeConfig ok");
}

async function testProbeMockMcp() {
  const result = await probeOneBackend("mock", {
    command: process.execPath,
    args: [MOCK_MCP],
  });
  assert(result.tool_count >= 10, `expected tools from mock-mcp, got ${result.tool_count}`);
  assert(result.tools.some((t) => t.name === "echo"), "expected echo tool");
  assert(!result.error, "probe should succeed");
  console.error("[backend-probe] probeOneBackend ok");
}

async function testEnsureCacheAndMerge() {
  const dir = join(tmpdir(), `costgate-probe-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const cachePath = join(dir, "cache.json");
  const logDir = join(dir, "logs");
  mkdirSync(logDir, { recursive: true });
  const backends = {
    mock: { command: process.execPath, args: [MOCK_MCP] },
    github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
  };
  writeFileSync(join(dir, "backends.json"), JSON.stringify({ backends }, null, 2));
  writeFileSync(join(dir, "mcp.json"), "{}");
  writeFileSync(join(dir, "usage.json"), "{}");

  const catalogs = {
    github: { backend: "github", overrides: { list_pull_requests: "A" } },
  };

  assert(
    backendsNeedingProbe(backends, catalogs).includes("mock"),
    "mock needs probe"
  );
  assert(
    !backendsNeedingProbe(backends, catalogs).includes("github"),
    "github has catalog"
  );

  const { cache, errors } = await ensureBackendToolsCache(backends, catalogs, {
    cachePath,
    force: true,
  });
  assert(!errors.mock, `mock probe error: ${errors.mock ?? ""}`);
  assert(cache.backends.mock?.tool_count >= 10, "cache should store mock tools");

  const byTool = new Map();
  mergeBackendToolsCache(byTool, cache, backends);
  assert(byTool.has("echo"), "merge should add echo from cache");
  assert(byTool.get("echo")?.backend === "mock", "echo assigned to mock backend");

  const data = buildDashboardData({
    logDir,
    gateLogDir: logDir,
    usagePath: join(dir, "usage.json"),
    configPath: join(dir, "backends.json"),
    mcpPath: join(dir, "mcp.json"),
    backendToolsCache: cache,
    now: Date.now(),
  });

  const echo = data.tools.tools.find((t) => t.name === "echo");
  assert(echo?.backend === "mock", "dashboard merge should surface probed tools");

  rmSync(dir, { recursive: true, force: true });
  console.error("[backend-probe] ensure + merge ok");
}

async function testBuildToolsPayload() {
  const dir = join(tmpdir(), `costgate-tools-payload-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const logDir = join(dir, "logs");
  mkdirSync(logDir, { recursive: true });
  const backends = {
    mock: { command: process.execPath, args: [MOCK_MCP] },
  };
  writeFileSync(join(dir, "backends.json"), JSON.stringify({ backends }, null, 2));
  writeFileSync(join(dir, "mcp.json"), "{}");
  writeFileSync(join(dir, "usage.json"), "{}");

  const payload = await buildToolsPayload({
    logDir,
    gateLogDir: logDir,
    usagePath: join(dir, "usage.json"),
    configPath: join(dir, "backends.json"),
    mcpPath: join(dir, "mcp.json"),
    probeOptions: { cachePath: join(dir, "cache.json"), force: true },
    now: Date.now(),
  });

  assert(payload.tools.some((t) => t.name === "list_issues"), "tools payload includes probed tool");
  assert(payload.backends.includes("mock"), "mock backend listed");

  rmSync(dir, { recursive: true, force: true });
  console.error("[backend-probe] buildToolsPayload ok");
}

async function main() {
  testPrepareProbeConfig();
  await testProbeMockMcp();
  await testEnsureCacheAndMerge();
  await testBuildToolsPayload();
  console.error("[backend-probe] all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
