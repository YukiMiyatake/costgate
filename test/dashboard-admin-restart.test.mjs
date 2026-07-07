#!/usr/bin/env node
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { scheduleDashboardRestart } from "../scripts/lib/dashboard-restart.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testScheduleRestartUnit() {
  let closed = false;
  const server = {
    close(cb) {
      closed = true;
      cb?.();
    },
  };
  scheduleDashboardRestart(server, {
    delayMs: 0,
    schedule: (fn) => fn(),
    exit: () => {},
    host: "127.0.0.1",
    port: 19999,
  });
  assert(closed, "server closed");
  console.error("[dashboard-admin-restart] unit ok");
}

async function testHttpEndpoint() {
  const server = createDashboardServer();
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert(health.capabilities?.admin_restart === true, "admin_restart capability");

    const restart = await fetch(`${base}/api/admin/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delay_ms: 5000 }),
    });
    assert(restart.ok, `POST /api/admin/restart status ${restart.status}`);
    const body = await restart.json();
    assert(body.ok === true && body.restarting === true, "restart payload");

    console.error("[dashboard-admin-restart] http ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testScheduleRestartUnit();
  await testHttpEndpoint();
  console.error("[dashboard-admin-restart] all passed");
}

main().catch((e) => {
  console.error("[dashboard-admin-restart] fatal:", e);
  process.exit(1);
});
