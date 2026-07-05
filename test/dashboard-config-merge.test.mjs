#!/usr/bin/env node
/**
 * Phase 30: Global + project config merge (overlay model).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  mergeNamedRecords,
  resolveEffectiveConfig,
} from "../scripts/lib/dashboard-config-merge.mjs";
import { buildDashboardData } from "../scripts/lib/dashboard-data.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempRoot() {
  const dir = join(tmpdir(), `costgate-merge-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function testMergeNamedRecords() {
  const { merged, origins } = mergeNamedRecords(
    { a: { v: 1 }, b: { v: 2 } },
    { b: { v: 3 }, c: { v: 4 } }
  );
  assert(merged.a.v === 1, "global key kept");
  assert(merged.b.v === 3, "project overrides global");
  assert(merged.c.v === 4, "project-only key");
  assert(origins.a === "global", "a origin global");
  assert(origins.b === "project", "b origin project");
  assert(origins.c === "project", "c origin project");
  console.error("[config-merge] mergeNamedRecords ok");
}

function testResolveEffectiveConfigScoped() {
  const base = tempRoot();
  const globalDir = join(base, "global");
  const projectDir = join(base, "project", ".costgate");
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(globalDir, "backends.json"),
    JSON.stringify({
      backends: {
        serena: { command: "global-serena" },
        playwright: { command: "global-pw" },
      },
    })
  );
  writeFileSync(
    join(projectDir, "backends.json"),
    JSON.stringify({
      backends: {
        serena: { command: "project-serena" },
      },
    })
  );
  writeFileSync(
    join(globalDir, "mcp-disabled.json"),
    JSON.stringify({ stale: { command: "x" } })
  );

  const globalPaths = {
    configPath: join(globalDir, "backends.json"),
    overridesPath: join(globalDir, "tool-overrides.json"),
    disabledPath: join(globalDir, "mcp-disabled.json"),
  };
  const scopedPaths = {
    scoped: true,
    configPath: join(projectDir, "backends.json"),
    overridesPath: join(projectDir, "tool-overrides.json"),
    disabledPath: join(projectDir, "mcp-disabled.json"),
  };

  const effective = resolveEffectiveConfig(scopedPaths, globalPaths);
  assert(effective.config_merge === true, "merge flag");
  assert(effective.backends.serena.command === "project-serena", "project override");
  assert(effective.backends.playwright.command === "global-pw", "inherited global");
  assert(effective.backendOrigins.serena === "project", "serena origin");
  assert(effective.backendOrigins.playwright === "global", "playwright origin");
  assert(effective.disabledStore.stale?.command === "x", "inherited disabled");
  console.error("[config-merge] resolveEffectiveConfig ok");
}

function testBuildDashboardDataMergedMcps() {
  const base = tempRoot();
  const globalDir = join(base, "global");
  const projectRoot = join(base, "project");
  const projectDir = join(projectRoot, ".costgate");
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(globalDir, "backends.json"),
    JSON.stringify({ backends: { github: { command: "global-gh" } } })
  );
  writeFileSync(
    join(projectDir, "backends.json"),
    JSON.stringify({ backends: { filesystem: { command: "project-fs" } } })
  );
  writeFileSync(join(projectDir, "usage.json"), JSON.stringify({ tools: {} }));
  writeFileSync(join(base, "mcp.json"), JSON.stringify({ mcpServers: {} }));

  const data = buildDashboardData({
    scoped: true,
    projectRoot,
    logDir: join(base, "logs"),
    gateLogDir: join(base, "logs"),
    usagePath: join(projectDir, "usage.json"),
    configPath: join(projectDir, "backends.json"),
    overridesPath: join(projectDir, "tool-overrides.json"),
    disabledPath: join(projectDir, "mcp-disabled.json"),
    mcpPath: join(base, "mcp.json"),
    globalPaths: {
      configPath: join(globalDir, "backends.json"),
      overridesPath: join(globalDir, "tool-overrides.json"),
      disabledPath: join(globalDir, "mcp-disabled.json"),
    },
  });

  assert(data.config_merge === true, "payload merge flag");
  assert(data.overview.config_merge === true, "overview merge flag");
  const servers = data.mcps.servers ?? [];
  const gh = servers.find((s) => s.name === "github");
  const fs = servers.find((s) => s.name === "filesystem");
  assert(gh?.config_origin === "global", "github from global");
  assert(fs?.config_origin === "project", "filesystem from project");
  console.error("[config-merge] buildDashboardData ok");
}

function main() {
  testMergeNamedRecords();
  testResolveEffectiveConfigScoped();
  testBuildDashboardDataMergedMcps();
  console.error("[config-merge] all passed");
}

main();
