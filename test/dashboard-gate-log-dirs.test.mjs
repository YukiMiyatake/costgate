#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  collectGateLogDirs,
  existingGateLogDirs,
  workspaceGateLogDir,
} from "../scripts/lib/dashboard-gate-log-dirs.mjs";
import { buildGateLogFreshness } from "../scripts/lib/dashboard-data.mjs";
import { buildGateStatusPayload } from "../scripts/lib/dashboard-gate-status.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isolatedEnv(home) {
  return {
    HOME: home,
    USERPROFILE: home,
  };
}

function testCollectIncludesWorkspaceAndHome() {
  const base = join(tmpdir(), `costgate-log-dirs-${process.pid}-${Date.now()}`);
  const home = join(base, "home");
  const project = join(base, "proj");
  mkdirSync(join(home, ".costgate", "logs"), { recursive: true });
  mkdirSync(join(project, ".costgate", "logs"), { recursive: true });

  const dirs = collectGateLogDirs({
    projectRoot: project,
    includeRegistry: false,
    env: isolatedEnv(home),
  });
  assert(
    dirs.some((d) => resolve(d) === resolve(workspaceGateLogDir(project))),
    "workspace log dir included"
  );
  assert(
    dirs.some((d) => resolve(d) === resolve(join(home, ".costgate", "logs"))),
    "home log dir included"
  );
  assert(
    existingGateLogDirs({
      projectRoot: project,
      includeRegistry: false,
      env: isolatedEnv(home),
    }).length >= 2,
    "both dirs exist"
  );

  rmSync(base, { recursive: true, force: true });
  console.error("[gate-log-dirs] collect ok");
}

function testFreshnessFindsWorkspaceWhenHomeEmpty() {
  const base = join(tmpdir(), `costgate-log-fresh-ws-${process.pid}-${Date.now()}`);
  const home = join(base, "home");
  const project = join(base, "proj");
  const homeLogs = join(home, ".costgate", "logs");
  const wsLogs = join(project, ".costgate", "logs");
  mkdirSync(homeLogs, { recursive: true });
  mkdirSync(wsLogs, { recursive: true });
  writeFileSync(join(base, "gate-settings.json"), '{"version":1,"gate_mode":"filter"}\n');
  writeFileSync(join(base, "tool-overrides.json"), '{"version":1,"tools":{}}\n');

  const recent = new Date(Date.now() - 60_000).toISOString();
  writeFileSync(
    join(wsLogs, "gate-2026-07-28.jsonl"),
    JSON.stringify({
      type: "gate_event",
      event: "tools_list",
      ts: recent,
      project_root: project,
      tools_exposed: 3,
    }) + "\n"
  );

  const env = isolatedEnv(home);
  const fresh = buildGateLogFreshness({
    gateLogDir: homeLogs,
    projectRoot: project,
    includeRegistry: false,
    env,
    now: Date.now(),
  });
  assert(fresh.has_events, "workspace events found despite empty home");
  assert(!fresh.stale, "recent workspace event not stale");
  assert(resolve(fresh.source_dir) === resolve(wsLogs), "source_dir is workspace logs");

  const status = buildGateStatusPayload({
    gateLogDir: homeLogs,
    projectRoot: project,
    includeRegistry: false,
    env,
    now: Date.now(),
    gateSettingsPath: join(base, "gate-settings.json"),
    overridesPath: join(base, "tool-overrides.json"),
  });
  assert(status.connected === true, "status connected via workspace logs");
  assert(status.reason === "ok", "reason ok");
  assert(
    status.paths.gate_log_dirs_existing.map((d) => resolve(d)).includes(resolve(wsLogs)),
    "existing lists ws"
  );

  rmSync(base, { recursive: true, force: true });
  console.error("[gate-log-dirs] workspace freshness ok");
}

function testOfflineWhenNoLogsAnywhere() {
  const base = join(tmpdir(), `costgate-log-none-${process.pid}-${Date.now()}`);
  const home = join(base, "home");
  const project = join(base, "proj");
  mkdirSync(join(home, ".costgate", "logs"), { recursive: true });
  mkdirSync(join(project, ".costgate", "logs"), { recursive: true });
  writeFileSync(join(base, "gate-settings.json"), '{"version":1,"gate_mode":"filter"}\n');
  writeFileSync(join(base, "tool-overrides.json"), '{"version":1,"tools":{}}\n');

  const status = buildGateStatusPayload({
    gateLogDir: join(home, ".costgate", "logs"),
    projectRoot: project,
    includeRegistry: false,
    env: isolatedEnv(home),
    now: Date.now(),
    gateSettingsPath: join(base, "gate-settings.json"),
    overridesPath: join(base, "tool-overrides.json"),
  });
  assert(status.connected === false, "offline when empty");
  assert(status.reason === "no_gate_events", "reason no_gate_events");

  rmSync(base, { recursive: true, force: true });
  console.error("[gate-log-dirs] offline ok");
}

function testStaleWhenOnlyOldEvents() {
  const base = join(tmpdir(), `costgate-log-stale-${process.pid}-${Date.now()}`);
  const home = join(base, "home");
  const project = join(base, "proj");
  const wsLogs = join(project, ".costgate", "logs");
  mkdirSync(join(home, ".costgate", "logs"), { recursive: true });
  mkdirSync(wsLogs, { recursive: true });
  writeFileSync(join(base, "gate-settings.json"), '{"version":1,"gate_mode":"filter"}\n');
  writeFileSync(join(base, "tool-overrides.json"), '{"version":1,"tools":{}}\n');
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  writeFileSync(
    join(wsLogs, "gate-old.jsonl"),
    JSON.stringify({
      type: "gate_event",
      event: "tool_call",
      tool: "x",
      ts: old,
      project_root: project,
    }) + "\n"
  );

  const status = buildGateStatusPayload({
    gateLogDir: join(home, ".costgate", "logs"),
    projectRoot: project,
    includeRegistry: false,
    env: isolatedEnv(home),
    now: Date.now(),
    gateSettingsPath: join(base, "gate-settings.json"),
    overridesPath: join(base, "tool-overrides.json"),
  });
  assert(status.connected === false, "stale not connected");
  assert(status.reason === "stale", "reason stale");
  assert(status.gate_log.has_events, "has old events");

  rmSync(base, { recursive: true, force: true });
  console.error("[gate-log-dirs] stale ok");
}

testCollectIncludesWorkspaceAndHome();
testFreshnessFindsWorkspaceWhenHomeEmpty();
testOfflineWhenNoLogsAnywhere();
testStaleWhenOnlyOldEvents();
console.error("[gate-log-dirs] all passed");
