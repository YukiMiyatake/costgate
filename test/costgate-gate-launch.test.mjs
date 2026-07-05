#!/usr/bin/env node
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LAUNCH = join(ROOT, "scripts/costgate-gate-launch.mjs");
const MOCK_GATE = join(ROOT, "test/fixtures/mock-gate-exit.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testLaunchWithMockGate() {
  const port = 18100 + (process.pid % 800);
  const r = spawnSync(process.execPath, [LAUNCH], {
    env: {
      ...process.env,
      COSTGATE_GATE_BIN: MOCK_GATE,
      COSTGATE_DASHBOARD_AUTO: "0",
      COSTGATE_DASHBOARD_AUTO_OPEN: "0",
    },
    stdio: "pipe",
    encoding: "utf8",
  });
  assert(r.status === 0, `launch exit ${r.status}: ${r.stderr}`);
  console.error("[gate-launch] mock gate ok");
}

function testLaunchStartsDashboard() {
  const port = 18200 + (process.pid % 800);
  const host = "127.0.0.1";
  const r = spawnSync(process.execPath, [LAUNCH], {
    env: {
      ...process.env,
      COSTGATE_GATE_BIN: MOCK_GATE,
      COSTGATE_MOCK_GATE_DELAY_MS: "4000",
      COSTGATE_DASHBOARD_HOST: host,
      COSTGATE_DASHBOARD_PORT: String(port),
      COSTGATE_DASHBOARD_AUTO: "1",
      COSTGATE_DASHBOARD_AUTO_OPEN: "0",
    },
    stdio: "pipe",
    encoding: "utf8",
  });
  assert(r.status === 0, `launch with dashboard exit ${r.status}`);
  assert(
    r.stderr.includes("dashboard started") || r.stderr.includes("dashboard already running"),
    "dashboard log expected"
  );
  console.error("[gate-launch] dashboard sidecar ok");
}

async function main() {
  chmodSync(MOCK_GATE, 0o755);
  testLaunchWithMockGate();
  testLaunchStartsDashboard();
  console.error("[gate-launch] all passed");
}

main().catch((e) => {
  console.error("[gate-launch] fatal:", e);
  process.exit(1);
});
