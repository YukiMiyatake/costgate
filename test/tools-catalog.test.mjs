#!/usr/bin/env node
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildDashboardData } from "../scripts/lib/dashboard-data.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIX = join(ROOT, "test/fixtures/dashboard");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testCatalogMergeMultiBackend() {
  const dir = join(tmpdir(), `costgate-tools-cat-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const logDir = join(dir, "logs");
  mkdirSync(logDir, { recursive: true });
  copyFileSync(join(FIX, "gate-sample.jsonl"), join(logDir, "gate-fixture.jsonl"));

  const backends = {
    github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    serena: { command: "uvx", args: ["serena"] },
  };
  writeFileSync(join(dir, "backends.json"), JSON.stringify({ backends }, null, 2));
  writeFileSync(join(dir, "mcp.json"), readFileSync(join(FIX, "mcp.json")));
  writeFileSync(join(dir, "usage.json"), readFileSync(join(FIX, "usage.json")));

  const data = buildDashboardData({
    logDir,
    gateLogDir: logDir,
    usagePath: join(dir, "usage.json"),
    configPath: join(dir, "backends.json"),
    mcpPath: join(dir, "mcp.json"),
    windowDays: 30,
    now: Date.parse("2026-07-05T12:00:00.000Z"),
  });

  assert(data.tools.backends.includes("filesystem"), "configured backends include filesystem");
  assert(data.tools.backends_without_catalog.includes("serena"), "serena has no catalog");

  const readFile = data.tools.tools.find((t) => t.name === "read_file");
  assert(readFile?.backend === "filesystem", "read_file assigned to filesystem backend");

  const githubTool = data.tools.tools.find((t) => t.name === "list_pull_requests");
  assert(githubTool?.backend === "github", "github tool stays on github backend");

  console.error("[tools-catalog] multi-backend catalog merge ok");
}

testCatalogMergeMultiBackend();
console.error("[tools-catalog] all passed");
