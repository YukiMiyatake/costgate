#!/usr/bin/env node
/**
 * Phase 24: dashboard control unit tests (isolated temp files).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeAuthHeaders } from "./lib/dashboard-fetch.mjs";
import {
  setToolForceTier,
  setToolExcludeLock,
  setToolAlwaysExpose,
  patchToolOverride,
  bulkHideTools,
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

function testCorruptOverrides() {
  const dir = tempDir();
  const path = join(dir, "tool-overrides.json");
  writeFileSync(path, "{not json\n");
  const data = loadToolOverrides(path);
  assert(data.tools && Object.keys(data.tools).length === 0, "empty tools on corrupt");
  assert(data.corrupt === true, "corrupt flag");
  console.error("[dashboard-control] corrupt overrides ok");
}

function testToolOverrides() {
  const dir = tempDir();
  const path = join(dir, "tool-overrides.json");
  setToolForceTier("fork_repository", "hidden", path);
  const data = loadToolOverrides(path);
  assert(data.tools.fork_repository.force_tier === "hidden", "hidden tier");
  setToolExcludeLock("fork_repository", true, path);
  const locked = loadToolOverrides(path);
  assert(locked.tools.fork_repository.exclude_lock === true, "exclude lock preserved");
  assert(locked.tools.fork_repository.force_tier === "hidden", "force tier preserved");
  setToolForceTier("fork_repository", "default", path);
  const clearedTier = loadToolOverrides(path);
  assert(clearedTier.tools.fork_repository.exclude_lock === true, "lock survives tier clear");
  setToolExcludeLock("fork_repository", false, path);
  const cleared = loadToolOverrides(path);
  assert(!cleared.tools.fork_repository, "cleared override");
  console.error("[dashboard-control] tool overrides ok");
}

function testBulkHideSkipsLock() {
  const dir = tempDir();
  const path = join(dir, "tool-overrides.json");
  setToolExcludeLock("keep_me", true, path);
  const result = bulkHideTools(["keep_me", "hide_me"], path);
  assert(result.count === 1, "only unlocked hidden");
  assert(result.hidden.includes("hide_me"), "hide_me hidden");
  assert(!result.hidden.includes("keep_me"), "locked skipped");
  const data = loadToolOverrides(path);
  assert(data.tools.keep_me.exclude_lock === true, "lock intact");
  assert(!data.tools.keep_me.force_tier, "locked tool not hidden");
  console.error("[dashboard-control] bulk hide skip lock ok");
}

function testBulkHideSkipsPinned() {
  const dir = tempDir();
  const path = join(dir, "tool-overrides.json");
  setToolAlwaysExpose("pinned_tool", true, path);
  const result = bulkHideTools(["pinned_tool", "hide_me"], path);
  assert(result.count === 1, "only unpinned hidden");
  assert(result.hidden.includes("hide_me"), "hide_me hidden");
  assert(!result.hidden.includes("pinned_tool"), "pinned skipped");
  console.error("[dashboard-control] bulk hide skip pin ok");
}

function testPatchToolOverride() {
  const dir = tempDir();
  const path = join(dir, "tool-overrides.json");
  patchToolOverride("search_code", { exclude_lock: true }, path);
  patchToolOverride("search_code", { force_tier: "A" }, path);
  patchToolOverride("search_code", { always_expose: true }, path);
  const data = loadToolOverrides(path);
  assert(data.tools.search_code.force_tier === "A", "tier set");
  assert(data.tools.search_code.exclude_lock === true, "lock set");
  assert(data.tools.search_code.always_expose === true, "pin set");
  console.error("[dashboard-control] patch override ok");
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

function testBackendEnableDisable() {
  const dir = tempDir();
  const mcpPath = join(dir, "mcp.json");
  const disabledPath = join(dir, "mcp-disabled.json");
  const configPath = join(dir, "backends.json");
  writeFileSync(
    mcpPath,
    JSON.stringify({ mcpServers: { "costgate-gate": { command: "/bin/gate" } } }, null, 2)
  );
  writeFileSync(
    configPath,
    JSON.stringify({ backends: { filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] } } }, null, 2)
  );

  const off = setMcpServerEnabled("filesystem", false, { mcpPath, disabledPath, configPath });
  assert(off.role === "backend", "backend role");
  assert(off.updated.mcp_disabled === true, "disabled store updated");
  assert(off.updated.mcp_json === false, "mcp.json untouched");
  const cfg = loadMcpJson(mcpPath);
  assert(!cfg.mcpServers.filesystem, "backend not added to mcp.json");
  const disabled = JSON.parse(readFileSync(disabledPath, "utf8"));
  assert(disabled.filesystem?._costgate_backend === true, "backend marker stored");

  const on = setMcpServerEnabled("filesystem", true, { mcpPath, disabledPath, configPath });
  assert(on.updated.mcp_disabled === true, "removed from disabled");
  assert(!existsSync(disabledPath) || !readFileSync(disabledPath, "utf8").includes("filesystem"), "cleared disabled");
  console.error("[dashboard-control] backend enable/disable ok");
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
    assert(health.version === "31a", "dashboard health version");
    assert(health.read_only === false, "not read-only");

    const patch = await fetch(`${base}/api/tools/create_issue`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ force_tier: "hidden" }),
    });
    assert(patch.ok, `patch status ${patch.status}`);
    const body = await patch.json();
    assert(body.ok === true, "patch ok");
    assert(body.requires_gate_restart === false, "no gate restart");
    assert(body.gate_reload === "auto", "gate hot-reload hint");

    const pin = await fetch(`${base}/api/tools/search_code`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ always_expose: true }),
    });
    assert(pin.ok, `pin status ${pin.status}`);
    const pinBody = await pin.json();
    assert(pinBody.requires_gate_restart === false, "pin no restart");
    assert(pinBody.gate_reload === "auto", "pin gate_reload");

    const lock = await fetch(`${base}/api/tools/search_code`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ exclude_lock: true }),
    });
    assert(lock.ok, `lock status ${lock.status}`);
    const lockBody = await lock.json();
    assert(lockBody.requires_gate_restart === false, "lock no restart");
    assert(lockBody.gate_reload === undefined, "lock no gate_reload");

    const qualified = await fetch(`${base}/api/tools/search_code`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ force_tier: "hidden", backend: "github" }),
    });
    assert(qualified.ok, `qualified patch ${qualified.status}`);
    const qBody = await qualified.json();
    assert(qBody.storage_key === "github/search_code", "qualified storage key");
    assert(qBody.force_tier === "hidden", "qualified force_tier in response");

    const ov = readFileSync(overridesPath, "utf8");
    assert(ov.includes("create_issue"), "override written");
    console.error("[dashboard-control] HTTP PATCH ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testCorruptOverrides();
  testToolOverrides();
  testBulkHideSkipsLock();
  testBulkHideSkipsPinned();
  testPatchToolOverride();
  testMcpEnableDisable();
  testBackendEnableDisable();
  await testHttpPatch();
  console.error("[dashboard-control] all passed");
}

main().catch((e) => {
  console.error("[dashboard-control] fatal:", e);
  process.exit(1);
});
