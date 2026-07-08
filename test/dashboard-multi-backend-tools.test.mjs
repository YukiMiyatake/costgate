#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDashboardData } from "../scripts/lib/dashboard-data.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testSharedCatalogToolsStaySeparate() {
  const dir = join(tmpdir(), `costgate-multi-tool-rows-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const logDir = join(dir, "logs");
  mkdirSync(logDir, { recursive: true });

  const backends = {
    github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    mock: { command: "node", args: ["mock-mcp"] },
  };
  writeFileSync(join(dir, "backends.json"), JSON.stringify({ backends }, null, 2));
  writeFileSync(join(dir, "mcp.json"), "{}");
  writeFileSync(join(dir, "usage.json"), "{}");

  const data = buildDashboardData({
    logDir,
    gateLogDir: logDir,
    usagePath: join(dir, "usage.json"),
    configPath: join(dir, "backends.json"),
    mcpPath: join(dir, "mcp.json"),
    now: Date.now(),
  });

  const gh = data.tools.tools.find((t) => t.name === "github/search_code");
  const mock = data.tools.tools.find((t) => t.name === "mock/search_code");
  assert(gh?.backend === "github", "github/search_code row");
  assert(mock?.backend === "mock", "mock/search_code row");
  assert(gh?.tier === "A" && mock?.tier === "A", "each backend keeps its catalog tier");

  console.error("[dashboard-multi-backend-tools] shared catalog tools ok");
}

testSharedCatalogToolsStaySeparate();
console.error("[dashboard-multi-backend-tools] all passed");
