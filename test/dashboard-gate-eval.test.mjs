#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { evaluateGateSettings } from "../scripts/lib/dashboard-gate-eval.mjs";
import { gateBin } from "../scripts/lib/paths.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function testEvaluateGateSettings() {
  if (!existsSync(gateBin())) {
    console.error("[dashboard-gate-eval] skip unit (no gate binary)");
    return;
  }
  const result = await evaluateGateSettings(
    { exposure_mode: "conservative", intent_dynamic: false, static_intent: "pull request" },
    { startupMs: 3000 }
  );
  assert(result.tokens.filter > 0, "filter tokens");
  assert(result.eval?.total >= 1, "eval ran");
  console.error("[dashboard-gate-eval] unit ok");
}

async function testHttpEndpoint() {
  if (!existsSync(gateBin())) {
    console.error("[dashboard-gate-eval] skip http (no gate binary)");
    return;
  }
  const server = createDashboardServer();
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert(health.capabilities?.gate_eval === true, "gate_eval capability");

    const res = await fetch(`${base}/api/admin/gate-eval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: { exposure_mode: "conservative", static_intent: "pull request", intent_dynamic: false },
      }),
    });
    const body = await res.json();
    assert(res.status === 200, `http status ${res.status}`);
    assert(body.eval?.total >= 1, "eval in response");
    console.error("[dashboard-gate-eval] http ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  await testEvaluateGateSettings();
  await testHttpEndpoint();
  console.error("[dashboard-gate-eval] all passed");
}

main().catch((e) => {
  console.error("[dashboard-gate-eval] fatal:", e);
  process.exit(1);
});
