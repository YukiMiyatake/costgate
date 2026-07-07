#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDashboardData, buildGateLogFreshness } from "../scripts/lib/dashboard-data.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testFreshnessFromLogs() {
  const base = join(tmpdir(), `costgate-fresh-${process.pid}-${Date.now()}`);
  const logDir = join(base, "logs");
  mkdirSync(logDir, { recursive: true });
  const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  writeFileSync(
    join(logDir, "gate-2026-01-01.jsonl"),
    [
      JSON.stringify({ type: "gate_event", event: "tool_call", tool: "a", ts: old }),
      JSON.stringify({ type: "gate_event", event: "tools_list", backend: "x", ts: recent }),
    ].join("\n") + "\n"
  );

  const fresh = buildGateLogFreshness({ gateLogDir: logDir, now: Date.now() });
  assert(fresh.has_events, "has events");
  assert(!fresh.stale, "recent event not stale");
  assert(fresh.age_sec != null && fresh.age_sec < 600, "age reflects recent row");

  const data = buildDashboardData({
    logDir,
    gateLogDir: logDir,
    usagePath: join(base, "usage.json"),
    configPath: join(base, "backends.json"),
    mcpPath: join(base, "mcp.json"),
    now: Date.now(),
  });
  writeFileSync(join(base, "usage.json"), "{}");
  writeFileSync(join(base, "backends.json"), JSON.stringify({ backends: {} }));
  writeFileSync(join(base, "mcp.json"), "{}");

  assert(data.overview.gate_log_freshness?.has_events, "overview includes freshness");
  assert(data.tools.gate_log_freshness?.has_events, "tools includes freshness");

  rmSync(base, { recursive: true, force: true });
  console.error("[gate-freshness] recent ok");
}

function testStaleWhenOld() {
  const base = join(tmpdir(), `costgate-fresh-stale-${process.pid}-${Date.now()}`);
  const logDir = join(base, "logs");
  mkdirSync(logDir, { recursive: true });
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  writeFileSync(
    join(logDir, "gate-2026-01-01.jsonl"),
    JSON.stringify({ type: "gate_event", event: "tool_call", tool: "a", ts: old }) + "\n"
  );
  const fresh = buildGateLogFreshness({ gateLogDir: logDir, now: Date.now() });
  assert(fresh.stale, "old event is stale");
  rmSync(base, { recursive: true, force: true });
  console.error("[gate-freshness] stale ok");
}

function testNoEvents() {
  const base = join(tmpdir(), `costgate-fresh-none-${process.pid}-${Date.now()}`);
  const logDir = join(base, "logs");
  mkdirSync(logDir, { recursive: true });
  const fresh = buildGateLogFreshness({ gateLogDir: logDir, now: Date.now() });
  assert(!fresh.has_events && fresh.stale, "empty logs marked stale");
  rmSync(base, { recursive: true, force: true });
  console.error("[gate-freshness] none ok");
}

testFreshnessFromLogs();
testStaleWhenOld();
testNoEvents();
console.error("[gate-freshness] all passed");
