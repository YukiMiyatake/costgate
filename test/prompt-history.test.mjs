#!/usr/bin/env node
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  exportHistoryTurns,
  getHistoryTurn,
  listHistory,
  listHistoryTurns,
  listProbeHistorySessions,
} from "../scripts/lib/prompt-history.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIX = join(ROOT, "test/fixtures/dashboard");

function fixtureHistoryOptions() {
  const logDir = join(FIX, ".generated-history-logs");
  const historyDir = join(FIX, ".generated-history");
  const mockRoot = join(FIX, "mock-workspace");
  mkdirSync(logDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });
  mkdirSync(mockRoot, { recursive: true });
  const gateContent = readFileSync(join(FIX, "gate-sample.jsonl"), "utf8").replaceAll(
    "/work/costgate",
    mockRoot
  );
  writeFileSync(join(logDir, "gate-fixture.jsonl"), gateContent);
  copyFileSync(join(FIX, "probe-sample.jsonl"), join(logDir, "probe-fixture.jsonl"));
  const turnsContent = readFileSync(join(FIX, "turns-sample.jsonl"), "utf8").replaceAll(
    "/work/costgate",
    mockRoot
  );
  writeFileSync(join(historyDir, "turns.jsonl"), turnsContent);
  return { gateLogDir: logDir, logDir, historyDir, projectRoot: mockRoot, limit: 50 };
}

function testListTurns() {
  const payload = listHistoryTurns(fixtureHistoryOptions());
  assert.equal(payload.count, 2);
  assert.equal(payload.turns[0].generation_id, "gen-fixture-2");
  const latest = payload.turns[0];
  assert.equal(latest.metrics.tool_calls, 1);
  assert.equal(latest.tools_called[0], "search_issues");
  assert.equal(latest.metrics.saved_tokens_est, 1250);
  assert.equal(latest.correlation, "generation_id");

  const older = payload.turns[1];
  assert.equal(older.metrics.tools_list_events, 1);
  assert.equal(older.metrics.tool_calls, 1);
  assert.equal(older.tools_called[0], "list_pull_requests");
  console.log("ok listTurns");
}

function testGetTurn() {
  const opts = fixtureHistoryOptions();
  const turn = getHistoryTurn("gen-fixture-1", opts);
  assert.ok(turn);
  assert.equal(turn.metrics.tools_list_tokens_est, 800);
  assert.equal(getHistoryTurn("missing", opts), null);
  console.log("ok getTurn");
}

function testExportTurns() {
  const opts = fixtureHistoryOptions();
  const exported = exportHistoryTurns(["gen-fixture-2"], opts);
  assert.equal(exported.export_version, 1);
  assert.equal(exported.turns.length, 1);
  assert.equal(exported.turns[0].generation_id, "gen-fixture-2");
  console.log("ok exportTurns");
}

function testListProbeSessions() {
  const opts = fixtureHistoryOptions();
  const payload = listProbeHistorySessions({ ...opts, logDir: opts.gateLogDir });
  assert.equal(payload.source, "probe");
  assert.equal(payload.count, 2);
  assert.equal(payload.turns[0].session_id, "sess-002");
  assert.equal(payload.turns[0].metrics.tool_calls, 1);
  console.log("ok listProbeSessions");
}

function testListHistorySource() {
  const opts = fixtureHistoryOptions();
  assert.equal(listHistory({ ...opts, source: "turns" }).source, "turns");
  assert.equal(listHistory({ ...opts, source: "probe", logDir: opts.gateLogDir }).count, 2);
  console.log("ok listHistorySource");
}

function testToolsListLookback() {
  const opts = fixtureHistoryOptions();
  const gatePath = join(opts.gateLogDir, "gate-fixture.jsonl");
  const extra = {
    type: "gate_event",
    event: "tools_list",
    ts: "2026-06-10T08:58:00.000Z",
    backend: "github",
    tools_exposed: 12,
    tokens_est: 900,
    project_root: opts.projectRoot,
  };
  writeFileSync(gatePath, readFileSync(gatePath, "utf8") + `${JSON.stringify(extra)}\n`);
  const turn = getHistoryTurn("gen-fixture-1", opts);
  assert.ok(turn);
  assert.equal(turn.metrics.tools_list_events, 2, "lookback includes pre-turn tools_list");
  console.log("ok toolsListLookback");
}

function testCrossProjectIsolation() {
  const opts = fixtureHistoryOptions();
  const gatePath = join(opts.gateLogDir, "gate-fixture.jsonl");
  const otherRoot = "/work/other-project";
  const foreign = {
    type: "gate_event",
    event: "tool_call",
    ts: "2026-06-20T10:00:00.000Z",
    tool: "foreign_tool",
    response_bytes: 512,
    project_root: otherRoot,
    generation_id: "gen-fixture-2",
  };
  writeFileSync(gatePath, readFileSync(gatePath, "utf8") + `${JSON.stringify(foreign)}\n`);
  const turn = getHistoryTurn("gen-fixture-2", opts);
  assert.ok(turn);
  assert.equal(turn.tools_called.includes("foreign_tool"), false, "foreign project excluded");
  console.log("ok crossProjectIsolation");
}

function testToolsListWithoutProjectRoot() {
  const opts = fixtureHistoryOptions();
  const gatePath = join(opts.gateLogDir, "gate-fixture.jsonl");
  const extra = {
    type: "gate_event",
    event: "tools_list",
    ts: "2026-06-10T08:59:30.000Z",
    backend: "github",
    tools_exposed: 66,
    tokens_est: 4200,
  };
  writeFileSync(gatePath, readFileSync(gatePath, "utf8") + `${JSON.stringify(extra)}\n`);
  const turn = getHistoryTurn("gen-fixture-1", opts);
  assert.ok(turn);
  assert.equal(turn.metrics.tools_list_events >= 1, true, "tools_list without project_root joins turn");
  const joined = turn.tools_list.find((r) => r.tools_exposed === 66);
  assert.ok(joined, "exposed count preserved");
  console.log("ok toolsListWithoutProjectRoot");
}

function testToolsListStaleGenerationId() {
  const opts = fixtureHistoryOptions();
  const gatePath = join(opts.gateLogDir, "gate-fixture.jsonl");
  const extra = {
    type: "gate_event",
    event: "tools_list",
    ts: "2026-06-20T09:59:30.000Z",
    backend: "github",
    tools_exposed: 40,
    tokens_est: 3000,
    generation_id: "stale-other-gen",
    project_root: opts.projectRoot,
  };
  writeFileSync(gatePath, readFileSync(gatePath, "utf8") + `${JSON.stringify(extra)}\n`);
  const turn = getHistoryTurn("gen-fixture-2", opts);
  assert.ok(turn);
  assert.equal(turn.tools_list.some((r) => r.tools_exposed === 40), true, "stale gen id uses time window");
  console.log("ok toolsListStaleGenerationId");
}

function testToolCallWithoutProjectRoot() {
  const opts = fixtureHistoryOptions();
  const gatePath = join(opts.gateLogDir, "gate-fixture.jsonl");
  const extra = {
    type: "gate_event",
    event: "tool_call",
    ts: "2026-06-10T09:01:00.000Z",
    tool: "github/search_code",
    response_bytes: 1024,
    conversation_id: "conv-fixture",
  };
  writeFileSync(gatePath, readFileSync(gatePath, "utf8") + `${JSON.stringify(extra)}\n`);
  const turn = getHistoryTurn("gen-fixture-1", opts);
  assert.ok(turn);
  assert.equal(turn.metrics.tool_calls >= 2, true, "tool_call without project_root joins turn");
  assert.equal(turn.tools_called.includes("github/search_code") || turn.tools_called.includes("list_pull_requests"), true);
  console.log("ok toolCallWithoutProjectRoot");
}

testListTurns();
testToolsListLookback();
testToolsListWithoutProjectRoot();
testToolsListStaleGenerationId();
testToolCallWithoutProjectRoot();
testCrossProjectIsolation();
testGetTurn();
testExportTurns();
testListProbeSessions();
testListHistorySource();
console.log("prompt-history tests passed");
