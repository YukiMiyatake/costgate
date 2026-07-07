#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { buildGateStatusPayload } from "../scripts/lib/dashboard-gate-status.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const base = join(tmpdir(), `costgate-gate-status-${process.pid}`);
  mkdirSync(base, { recursive: true });
  const logDir = join(base, "logs");
  mkdirSync(logDir, { recursive: true });
  const now = Date.parse("2026-07-07T12:00:00.000Z");
  writeFileSync(
    join(logDir, "gate-2026-07-07.jsonl"),
    `${JSON.stringify({
      type: "gate_event",
      event: "settings_reload",
      ts: new Date(now - 30_000).toISOString(),
      config_generation: "abc123",
    })}\n`
  );
  writeFileSync(join(base, "gate-settings.json"), '{"version":1,"gate_mode":"filter"}\n');
  writeFileSync(join(base, "tool-overrides.json"), '{"version":1,"tools":{}}\n');

  const unit = buildGateStatusPayload({
    gateLogDir: logDir,
    gateSettingsPath: join(base, "gate-settings.json"),
    overridesPath: join(base, "tool-overrides.json"),
    now,
  });
  assert(unit.ok === true, "payload ok");
  assert(unit.hot_reload.gate_settings === true, "hot_reload gate_settings");
  assert(unit.last_reload_event === "settings_reload", "reload event");
  assert(typeof unit.config_generation.combined === "string", "combined gen");

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
    assert(status.config_generation.combined, "status combined gen");
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
