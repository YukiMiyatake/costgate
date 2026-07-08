#!/usr/bin/env node
/**
 * Gate settings — load/save/env merge tests.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_GATE_SETTINGS,
  loadGateSettings,
  patchGateSettings,
  gateSettingsToEnv,
  applyGateSettingsToEnv,
  gateSettingsGeneration,
} from "../scripts/lib/gate-settings.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempRoot() {
  const base = join(tmpdir(), `costgate-gate-settings-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  return base;
}

function testGlobalOrigins() {
  const root = tempRoot();
  const globalPath = join(root, "gate-settings.json");
  patchGateSettings({ intent_probe: false }, { path: globalPath });
  const loaded = loadGateSettings({ globalPath, projectRoot: join(root, "missing"), scoped: true });
  assert(loaded.origins.intent_probe === "global", "global origin when only global file");
  assert(loaded.origins.gate_mode === "global", "global gate_mode origin");
  console.error("[gate-settings] global origins ok");
}

function testSettingsGeneration() {
  const gen = gateSettingsGeneration(DEFAULT_GATE_SETTINGS);
  assert(typeof gen === "string" && gen.length === 16, "generation hash");
  assert(gateSettingsGeneration(DEFAULT_GATE_SETTINGS) === gen, "stable hash");
  console.error("[gate-settings] generation ok");
}

function testDefaults() {
  const root = tempRoot();
  const loaded = loadGateSettings({
    globalPath: join(root, "missing-gate-settings.json"),
    projectRoot: root,
    scoped: true,
  });
  assert(loaded.settings.gate_mode === "transparent", "default mode");
  assert(loaded.settings.exposure_mode === "permissive", "default exposure");
  assert(loaded.settings.compress === true, "default compress");
  console.error("[gate-settings] defaults ok");
}

function testProjectOverride() {
  const root = tempRoot();
  patchGateSettings({ compress: false, static_intent: "github pull" }, {
    projectRoot: root,
    scoped: true,
  });
  const loaded = loadGateSettings({ projectRoot: root, scoped: true });
  assert(loaded.settings.compress === false, "project compress");
  assert(loaded.settings.static_intent === "github pull", "static intent");
  assert(loaded.origins.compress === "project", "origin project");
  console.error("[gate-settings] project override ok");
}

function testEnvMapping() {
  const env = gateSettingsToEnv({
    ...DEFAULT_GATE_SETTINGS,
    compress: false,
    gate_mode: "transparent",
    exposure_mode: "aggressive",
    exposure_max_b: 3,
    exposure_token_budget: 2500,
    slim_list: true,
  });
  assert(env.COSTGATE_COMPRESS === "0", "compress env");
  assert(env.COSTGATE_GATE_MODE === "transparent", "mode env");
  assert(env.COSTGATE_EXPOSURE_MODE === "aggressive", "exposure mode env");
  assert(env.COSTGATE_EXPOSURE_MAX_B === "3", "exposure max b env");
  assert(env.COSTGATE_EXPOSURE_TOKEN_BUDGET === "2500", "exposure budget env");
  assert(env.COSTGATE_SLIM_LIST === "1", "slim list env");
  assert(env.COSTGATE_SLIM_LIST_MAX_CHARS === "120", "slim max env");
  console.error("[gate-settings] env mapping ok");
}

function testApplyToEnv() {
  const root = tempRoot();
  patchGateSettings({ code_mode: false }, { projectRoot: root, scoped: true });
  const { env, meta } = applyGateSettingsToEnv({
    ...process.env,
    COSTGATE_PROJECT_ROOT: root,
  });
  assert(env.COSTGATE_CODE_MODE === "0", "launcher merge");
  assert(meta.settings.code_mode === false, "meta settings");
  console.error("[gate-settings] apply env ok");
}

async function testHttpApi() {
  const root = tempRoot();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(root, "backends.json"), '{"backends":{}}\n');
  writeFileSync(join(root, "mcp.json"), '{"mcpServers":{}}\n');
  const { createDashboardServer } = await import("../scripts/dashboard-server.mjs");
  mkdirSync(join(root, "logs"), { recursive: true });
  const server = createDashboardServer({
    dataOptions: {
      logDir: join(root, "logs"),
      usagePath: join(root, "usage.json"),
      configPath: join(root, "backends.json"),
      mcpPath: join(root, "mcp.json"),
      gateSettingsPath: join(root, "gate-settings.json"),
      windowDays: 30,
    },
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const get = await fetch(`${base}/api/gate-settings`).then((r) => r.json());
    assert(get.settings.gate_mode === "transparent", "GET settings");
    assert(get.defs?.length >= 5, "GET defs");
    assert(get.hot_reload === true, "hot_reload flag");

    const patch = await fetch(`${base}/api/gate-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { intent_probe: false } }),
    });
    assert(patch.ok, `PATCH ${patch.status}`);
    const body = await patch.json();
    assert(body.settings.intent_probe === false, "patched");
    assert(body.requires_gate_restart === false, "hot-reloadable");
    assert(body.gate_reload === "auto", "gate_reload hint");

    const modePatch = await fetch(`${base}/api/gate-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { gate_mode: "filter" } }),
    });
    assert(modePatch.ok, `filter PATCH ${modePatch.status}`);
    const filterBody = await modePatch.json();
    assert(filterBody.requires_gate_restart === true, "filter mode needs restart");

    const transparentPatch = await fetch(`${base}/api/gate-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { gate_mode: "transparent" } }),
    });
    assert(transparentPatch.ok, `mode PATCH ${transparentPatch.status}`);
    const modeBody = await transparentPatch.json();
    assert(modeBody.requires_gate_restart === true, "gate_mode needs restart");
    assert(modeBody.gate_reload === undefined, "no auto reload for mode");

    const again = await fetch(`${base}/api/gate-settings`).then((r) => r.json());
    assert(again.settings.intent_probe === false, "persisted");
    console.error("[gate-settings] HTTP API ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testSettingsGeneration();
  testGlobalOrigins();
  testDefaults();
  testProjectOverride();
  testEnvMapping();
  testApplyToEnv();
  await testHttpApi();
  console.error("[gate-settings] all passed");
}

main().catch((e) => {
  console.error("[gate-settings] fatal:", e);
  process.exit(1);
});
