#!/usr/bin/env node
import { existsSync, unlinkSync } from "node:fs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import {
  ensureDashboard,
  fetchDashboardHealth,
  isDashboardFresh,
  isStaleDashboardCapabilities,
  isStaleDashboardHealth,
  dashboardServerScript,
  isDashboardAutoEnabled,
  resolveDashboardAutoOpen,
  shouldOpenDashboardBrowser,
  markDashboardBrowserOpened,
  clearDashboardBrowserOpenedFlag,
  browserOpenedFlagPath,
} from "../scripts/lib/dashboard-launcher.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function withServer(fn) {
  const server = createDashboardServer();
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  try {
    await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testProbe() {
  await withServer(async (port) => {
    assert(await isDashboardFresh({ host: "127.0.0.1", port }), "fresh ok");
    assert(!(await isDashboardFresh({ host: "127.0.0.1", port: port + 1 })), "wrong port");
  });
  console.error("[dashboard-launcher] probe ok");
}

async function testEnsureStartsAndReuses() {
  const port = 18000 + (process.pid % 1000);
  const host = "127.0.0.1";
  const env = {
    ...process.env,
    COSTGATE_DASHBOARD_HOST: host,
    COSTGATE_DASHBOARD_PORT: String(port),
    COSTGATE_DASHBOARD_AUTO: "1",
    COSTGATE_DASHBOARD_AUTO_OPEN: "0",
  };

  assert(!(await fetchDashboardHealth({ host, port })).ok, "port free");

  let spawnedPid = null;
  try {
    const first = await ensureDashboard({ host, port, env, openBrowser: false });
    spawnedPid = first.pid ?? null;
    assert(first.started === true, "started first time");
    assert(first.running === true, "running after start");

    const second = await ensureDashboard({ host, port, env, openBrowser: false });
    assert(second.started === false, "reuse existing");
    assert(second.running === true, "still running");
  } finally {
    if (spawnedPid) {
      try {
        process.kill(spawnedPid, "SIGTERM");
      } catch {
        /* already exited */
      }
    }
  }

  console.error("[dashboard-launcher] ensure ok");
}

function testEnvFlags() {
  assert(isDashboardAutoEnabled({ COSTGATE_DASHBOARD_AUTO: "1" }), "auto on");
  assert(!isDashboardAutoEnabled({ COSTGATE_DASHBOARD_AUTO: "0" }), "auto off");
  assert(resolveDashboardAutoOpen({}) === "once", "default once");
  assert(resolveDashboardAutoOpen({ COSTGATE_DASHBOARD_AUTO_OPEN: "always" }) === "always", "always");
  assert(resolveDashboardAutoOpen({ COSTGATE_DASHBOARD_AUTO_OPEN: "0" }) === "never", "never");
  assert(existsSync(dashboardServerScript()), "dashboard script path");
  console.error("[dashboard-launcher] env ok");
}

function testAutoOpenOnce() {
  const host = "127.0.0.1";
  const port = 18787;
  const flag = browserOpenedFlagPath();
  try {
    if (existsSync(flag)) unlinkSync(flag);
    assert(shouldOpenDashboardBrowser(host, port, { env: {} }), "first open");
    markDashboardBrowserOpened(host, port);
    assert(!shouldOpenDashboardBrowser(host, port, { env: {} }), "skip same host/port");
    assert(shouldOpenDashboardBrowser(host, port + 1, { env: {} }), "different port opens");
    assert(!shouldOpenDashboardBrowser(host, port, { openBrowser: false }), "explicit never");
    clearDashboardBrowserOpenedFlag();
    assert(shouldOpenDashboardBrowser(host, port, { env: {} }), "after clear");
  } finally {
    clearDashboardBrowserOpenedFlag();
  }
  console.error("[dashboard-launcher] auto-open once ok");
}

function testStaleHealth() {
  assert(isStaleDashboardHealth({ status: "ok" }), "missing ui is stale");
  assert(!isStaleDashboardHealth({ status: "ok", ui: { settings: {} } }), "ui present is fresh");
  assert(!isStaleDashboardHealth(null), "null not stale");
  assert(
    isStaleDashboardCapabilities({ status: "ok", ui: { settings: {} }, capabilities: { shield_settings: false } }),
    "missing shield_settings capability is stale"
  );
  assert(
    !isStaleDashboardCapabilities({
      status: "ok",
      ui: { settings: {} },
      capabilities: { shield_settings: true, workspace_deep_routes: true },
    }),
    "full capabilities is fresh"
  );
  console.error("[dashboard-launcher] stale health ok");
}

async function main() {
  testEnvFlags();
  testAutoOpenOnce();
  testStaleHealth();
  await testProbe();
  await testEnsureStartsAndReuses();
  console.error("[dashboard-launcher] all passed");
}

main().catch((e) => {
  console.error("[dashboard-launcher] fatal:", e);
  process.exit(1);
});
