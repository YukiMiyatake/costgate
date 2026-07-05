#!/usr/bin/env node
/**
 * Phase 24: dashboard control unit tests (isolated temp files).
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  setToolForceTier,
  setMcpServerEnabled,
  loadToolOverrides,
  loadMcpJson,
} from "../scripts/lib/dashboard-control.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const dir = join(tmpdir(), `costgate-dash-ctl-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function testToolOverrides() {
  const dir = tempDir();
  const path = join(dir, "tool-overrides.json");
  setToolForceTier("fork_repository", "hidden", path);
  const data = loadToolOverrides(path);
  assert(data.tools.fork_repository.force_tier === "hidden", "hidden tier");
  setToolForceTier("fork_repository", "default", path);
  const cleared = loadToolOverrides(path);
  assert(!cleared.tools.fork_repository, "cleared override");
  console.error("[dashboard-control] tool overrides ok");
}

function testMcpEnableDisable() {
  const dir = tempDir();
  const mcpPath = join(dir, "mcp.json");
  const disabledPath = join(dir, "mcp-disabled.json");
  writeFileSync(
    mcpPath,
    JSON.stringify(
      {
        mcpServers: {
          "test-server": { command: "echo", args: ["hi"] },
          "costgate-gate": { command: "/bin/gate" },
        },
      },
      null,
      2
    )
  );

  const off = setMcpServerEnabled("test-server", false, { mcpPath, disabledPath });
  assert(off.requires_cursor_restart === true, "restart flag");
  const cfg = loadMcpJson(mcpPath);
  assert(!cfg.mcpServers["test-server"], "removed from mcp");
  assert(cfg.mcpServers["costgate-gate"], "gate kept");

  const on = setMcpServerEnabled("test-server", true, { mcpPath, disabledPath });
  assert(on.servers.includes("test-server"), "restored");
  const restored = loadMcpJson(mcpPath);
  assert(restored.mcpServers["test-server"].command === "echo", "config restored");
  console.error("[dashboard-control] mcp enable/disable ok");
}

async function testHttpPatch() {
  const dir = tempDir();
  const overridesPath = join(dir, "tool-overrides.json");
  const mcpPath = join(dir, "mcp.json");
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: { foo: { command: "x" } } }, null, 2));

  const { createDashboardServer } = await import("../scripts/dashboard-server.mjs");
  const server = createDashboardServer({
    dataOptions: {
      logDir: join(dir, "logs"),
      usagePath: join(dir, "usage.json"),
      configPath: join(dir, "backends.json"),
      mcpPath,
      overridesPath,
      windowDays: 30,
    },
    controlPaths: { overridesPath, mcpPath, disabledPath: join(dir, "disabled.json") },
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert(health.version === "phase24", "phase24 health");
    assert(health.read_only === false, "not read-only");

    const patch = await fetch(`${base}/api/tools/create_issue`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force_tier: "hidden" }),
    });
    assert(patch.ok, `patch status ${patch.status}`);
    const body = await patch.json();
    assert(body.ok === true, "patch ok");

    const ov = readFileSync(overridesPath, "utf8");
    assert(ov.includes("create_issue"), "override written");
    console.error("[dashboard-control] HTTP PATCH ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testToolOverrides();
  testMcpEnableDisable();
  await testHttpPatch();
  console.error("[dashboard-control] all passed");
}

main().catch((e) => {
  console.error("[dashboard-control] fatal:", e);
  process.exit(1);
});
