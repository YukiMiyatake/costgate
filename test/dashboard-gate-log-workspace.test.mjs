#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseProbeToolStats } from "../scripts/lib/dashboard-data.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testWorkspaceGateLogFilter() {
  const base = join(tmpdir(), `costgate-gate-ws-${process.pid}-${Date.now()}`);
  const globalLog = join(base, "global", "logs");
  const wsA = join(base, "project-a");
  const wsB = join(base, "project-b");
  const localLogA = join(wsA, ".costgate", "logs");
  mkdirSync(globalLog, { recursive: true });
  mkdirSync(localLogA, { recursive: true });

  const ts = new Date().toISOString();
  const globalLine = (tool, root) =>
    JSON.stringify({
      type: "gate_event",
      event: "tool_call",
      tool,
      project_root: root,
      ts,
    });
  writeFileSync(
    join(globalLog, "gate-2026-01-01.jsonl"),
    [
      globalLine("serena/find_symbol", wsA),
      globalLine("aieph/search", wsB),
      globalLine("orphan/tool", null),
    ].join("\n") + "\n"
  );
  writeFileSync(
    join(localLogA, "gate-2026-01-01.jsonl"),
    JSON.stringify({
      type: "gate_event",
      event: "tool_call",
      tool: "local/only",
      ts,
    }) + "\n"
  );

  const { byTool } = parseProbeToolStats(localLogA, null, localLogA, {
    projectRoot: wsA,
    globalGateLogDir: globalLog,
  });

  assert(byTool.has("local/only"), "local log without project_root included");
  assert(byTool.has("serena/find_symbol"), "global log with matching project_root included");
  assert(!byTool.has("aieph/search"), "other workspace excluded from global log");
  assert(!byTool.has("orphan/tool"), "untagged global rows excluded in strict mode");

  const globalView = parseProbeToolStats(globalLog, null, globalLog);
  assert(globalView.byTool.size >= 3, "global view includes all rows");

  rmSync(base, { recursive: true, force: true });
  console.error("[gate-log-workspace] filter ok");
}

function testGlobalViewUnfiltered() {
  const base = join(tmpdir(), `costgate-gate-global-${process.pid}-${Date.now()}`);
  const globalLog = join(base, "logs");
  mkdirSync(globalLog, { recursive: true });
  writeFileSync(
    join(globalLog, "gate-2026-01-01.jsonl"),
    JSON.stringify({
      type: "gate_event",
      event: "tool_call",
      tool: "any/tool",
      project_root: "/any",
      ts: new Date().toISOString(),
    }) + "\n"
  );
  const { byTool } = parseProbeToolStats(globalLog, null, globalLog);
  assert(byTool.has("any/tool"), "global dashboard shows all tools");
  rmSync(base, { recursive: true, force: true });
  console.error("[gate-log-workspace] global view ok");
}

testWorkspaceGateLogFilter();
testGlobalViewUnfiltered();
console.error("[gate-log-workspace] all passed");
