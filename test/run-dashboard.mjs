#!/usr/bin/env node
/**
 * Run all dashboard + cursor registry hook tests (CI: test:dashboard:all).
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const TESTS = [
  "dashboard-api.test.mjs",
  "dashboard-backend-probe.test.mjs",
  "dashboard-control.test.mjs",
  "dashboard-marketplace.test.mjs",
  "dashboard-project-recommend.test.mjs",
  "dashboard-routes.test.mjs",
  "dashboard-ui-settings.test.mjs",
  "dashboard-workspaces.test.mjs",
  "dashboard-config-merge.test.mjs",
  "dashboard-launcher.test.mjs",
  "dashboard-probe.test.mjs",
  "cursor-registry-hook.test.mjs",
  "install-cursor-registry-hook.test.mjs",
  "cursor-prompt-intent-hook.test.mjs",
  "cursor-shield-mcp-hook.test.mjs",
  "cursor-shield-read-hook.test.mjs",
  "prompt-intent.test.mjs",
  "gate-settings.test.mjs",
  "shield-settings.test.mjs",
  "mcp-trust.test.mjs",
  "shield-prompt-33b.test.mjs",
  "costgate-gate-launch.test.mjs",
];

for (const file of TESTS) {
  const path = join(ROOT, "test", file);
  const r = spawnSync(process.execPath, [path], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.error("[dashboard:all] passed");
