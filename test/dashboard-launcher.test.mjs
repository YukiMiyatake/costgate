#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import {
  ensureDashboard,
  probeDashboardHealth,
  dashboardServerScript,
  isDashboardAutoEnabled,
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
    assert(await probeDashboardHealth({ host: "127.0.0.1", port }), "health ok");
    assert(!(await probeDashboardHealth({ host: "127.0.0.1", port: port + 1 })), "wrong port");
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

  assert(!(await probeDashboardHealth({ host, port })), "port free");

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
  assert(existsSync(dashboardServerScript()), "dashboard script path");
  console.error("[dashboard-launcher] env ok");
}

async function main() {
  testEnvFlags();
  await testProbe();
  await testEnsureStartsAndReuses();
  console.error("[dashboard-launcher] all passed");
}

main().catch((e) => {
  console.error("[dashboard-launcher] fatal:", e);
  process.exit(1);
});
