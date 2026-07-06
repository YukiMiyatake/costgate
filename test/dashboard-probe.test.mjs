#!/usr/bin/env node
import assert from "node:assert/strict";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import {
  isDashboardFresh,
  isStaleDashboardCapabilities,
  probeDashboardApi,
  probeWorkspaceDeepRoutes,
} from "../scripts/lib/dashboard-probe.mjs";

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

async function testFreshServer() {
  await withServer(async (port) => {
    assert(await probeDashboardApi({ host: "127.0.0.1", port }, "/api/shield-settings"));
    assert(await probeWorkspaceDeepRoutes({ host: "127.0.0.1", port }));
    assert(await isDashboardFresh({ host: "127.0.0.1", port }));
  });
  console.error("[dashboard-probe] fresh server ok");
}

function testStaleCapabilities() {
  assert(
    isStaleDashboardCapabilities({
      status: "ok",
      ui: { settings: {} },
      capabilities: { shield_settings: false },
    })
  );
  assert(
    isStaleDashboardCapabilities({
      status: "ok",
      ui: { settings: {} },
      capabilities: { shield_settings: true, workspace_deep_routes: false },
    }),
    "workspace_deep_routes false is stale"
  );
  assert(
    !isStaleDashboardCapabilities({
      status: "ok",
      ui: { settings: {} },
      capabilities: { shield_settings: true, workspace_deep_routes: true },
    })
  );
  console.error("[dashboard-probe] stale capabilities ok");
}

async function main() {
  testStaleCapabilities();
  await testFreshServer();
  console.error("[dashboard-probe] all passed");
}

main().catch((e) => {
  console.error("[dashboard-probe] fatal:", e);
  process.exit(1);
});
