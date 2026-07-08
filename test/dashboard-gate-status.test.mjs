#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { buildGateStatusPayload } from "../scripts/lib/dashboard-gate-status.mjs";
import { gateSettingsGeneration } from "../scripts/lib/gate-settings.mjs";
import { toolOverridesGeneration } from "../scripts/lib/dashboard-control.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const base = join(tmpdir(), `costgate-gate-status-${process.pid}`);
  mkdirSync(base, { recursive: true });
  const logDir = join(base, "logs");
  mkdirSync(logDir, { recursive: true });
  const now = Date.parse("2026-07-07T12:00:00.000Z");
  writeFileSync(join(base, "gate-settings.json"), '{"version":1,"gate_mode":"filter"}\n');
  writeFileSync(join(base, "tool-overrides.json"), '{"version":1,"tools":{}}\n');

  const settingsGen = gateSettingsGeneration({ version: 1, gate_mode: "filter" });
  const overridesGen = toolOverridesGeneration({ version: 1, tools: {} });
  writeFileSync(
    join(logDir, "gate-2026-07-07.jsonl"),
    `${JSON.stringify({
      type: "gate_event",
      event: "settings_reload",
      ts: new Date(now - 30_000).toISOString(),
      config_generation: settingsGen,
    })}\n${JSON.stringify({
      type: "gate_event",
      event: "overrides_reload",
      ts: new Date(now - 20_000).toISOString(),
      overrides_generation: overridesGen,
    })}\n`
  );

  const unit = buildGateStatusPayload({
    gateLogDir: logDir,
    gateSettingsPath: join(base, "gate-settings.json"),
    overridesPath: join(base, "tool-overrides.json"),
    now,
  });
  assert(unit.ok === true, "payload ok");
  assert(unit.hot_reload.gate_settings === true, "hot_reload gate_settings");
  assert(unit.last_reload_event === "overrides_reload", "latest reload event");
  assert(unit.pending_changes === false, "synced when generations match");
  assert(unit.pending.gate_settings === false, "settings synced");
  assert(unit.pending.tool_overrides === false, "overrides synced");
  assert(unit.config_generation.gate_settings === settingsGen, "settings gen");
  assert(unit.config_generation.last_applied_settings === settingsGen, "applied settings");

  const server = createDashboardServer({
    dataOptions: {
      logDir,
      gateLogDir: logDir,
      gateSettingsPath: join(base, "gate-settings.json"),
      overridesPath: join(base, "tool-overrides.json"),
      configPath: join(base, "backends.json"),
      mcpPath: join(base, "mcp.json"),
      windowDays: 30,
    },
    controlPaths: {
      overridesPath: join(base, "tool-overrides.json"),
      gateSettingsPath: join(base, "gate-settings.json"),
    },
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    assert(health.capabilities?.gate_status === true, "health capability");

    const status = await fetch(`http://127.0.0.1:${port}/api/gate/status`).then((r) => r.json());
    assert(status.ok === true, "GET /api/gate/status");
    assert(status.config_generation.gate_settings, "status settings gen");
    assert(status.pending_changes === false, "status synced");
    assert(status.last_reload_at, "last_reload_at");
    console.error("[dashboard-gate-status] ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((e) => {
  console.error("[dashboard-gate-status] fatal:", e);
  process.exit(1);
});
