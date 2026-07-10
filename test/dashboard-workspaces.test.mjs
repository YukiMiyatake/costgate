#!/usr/bin/env node
/**
 * Phase 28: workspace registry + scoped dashboard API tests.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  encodeWorkspaceId,
  decodeWorkspaceId,
  pinWorkspace,
  listWorkspaces,
  workspaceScopedPaths,
  registryPath,
  touchRegistryPath,
} from "../scripts/lib/dashboard-workspaces.mjs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { writeAuthHeaders } from "./lib/dashboard-fetch.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempRoot() {
  const dir = join(tmpdir(), `costgate-ws-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function setupWorkspace(root) {
  mkdirSync(join(root, ".costgate"), { recursive: true });
  writeFileSync(join(root, ".costgate", "backends.json"), JSON.stringify({ backends: {} }, null, 2));
}

function testEncodeDecode() {
  const p = resolve(ROOT);
  const id = encodeWorkspaceId(p);
  assert(decodeWorkspaceId(id) === p, "roundtrip path");
  console.error("[workspaces] encode/decode ok");
}

function testScopedPaths() {
  const root = tempRoot();
  setupWorkspace(root);
  const paths = workspaceScopedPaths(root);
  assert(paths.configPath.endsWith(".costgate/backends.json"), "config path");
  assert(paths.scoped === true, "scoped flag");
  console.error("[workspaces] scoped paths ok");
}

function testPinAndList() {
  const base = tempRoot();
  const regPath = join(base, "registry.json");
  const ws = join(base, "my-project");
  setupWorkspace(ws);
  pinWorkspace(ws, regPath);
  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces.length === 1, "pinned workspace");
  assert(list.workspaces[0].pinned === true, "pinned flag");
  assert(list.workspaces[0].source === "pin", "pin source");
  console.error("[workspaces] pin/list ok");
}

function testRegistrySource() {
  const base = tempRoot();
  const regPath = join(base, "registry.json");
  const ws = join(base, "app");
  setupWorkspace(ws);
  touchRegistryPath(ws, { registryPath: regPath, source: "gate" });
  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces[0].source === "gate", "gate source");
  assert(list.workspaces[0].source_label === "Gate", "gate label");
  assert(list.help?.includes("project"), "help text");
  console.error("[workspaces] registry source ok");
}

function testSkipMissingRegistryPaths() {
  const base = tempRoot();
  const regPath = join(base, "registry.json");
  writeFileSync(
    regPath,
    JSON.stringify(
      {
        version: 1,
        workspaces: [
          {
            path: join(base, "ghost-missing"),
            label: "ghost",
            last_seen: new Date().toISOString(),
            pinned: true,
          },
        ],
      },
      null,
      2
    )
  );
  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces.length === 0, "missing registry paths skipped");
  console.error("[workspaces] skip missing paths ok");
}

async function testHttpScopedApi() {
  const base = tempRoot();
  const regPath = join(base, "registry.json");
  const ws = join(base, "app");
  setupWorkspace(ws);
  pinWorkspace(ws, regPath);
  const wsId = encodeWorkspaceId(ws);
  const mcpPath = join(ws, ".cursor", "mcp.json");
  mkdirSync(join(ws, ".cursor"), { recursive: true });
  writeFileSync(
    mcpPath,
    JSON.stringify(
      {
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", ws] },
          "costgate-gate": { command: "/bin/gate" },
        },
      },
      null,
      2
    )
  );

  const server = createDashboardServer({
    dataOptions: {
      logDir: join(base, "logs"),
      usagePath: join(base, "usage.json"),
      windowDays: 30,
      mcpPath,
      disabledPath: join(ws, ".costgate", "mcp-disabled.json"),
    },
    controlPaths: {
      mcpPath,
      disabledPath: join(ws, ".costgate", "mcp-disabled.json"),
    },
  });

  process.env.COSTGATE_WORKSPACE_REGISTRY = regPath;

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  try {
    const list = await fetch(`${origin}/api/workspaces`).then((r) => r.json());
    assert(list.workspaces.length >= 1, "GET workspaces");

    const overview = await fetch(`${origin}/api/workspaces/${wsId}/overview`).then((r) => r.json());
    assert(overview.window_days != null || overview.sessions != null, "scoped overview");

    const post = await fetch(`${origin}/api/workspaces/${wsId}/mcps`, {
      method: "POST",
      headers: writeAuthHeaders("POST"),
      body: JSON.stringify({
        template: "filesystem",
        env: { ALLOWED_PATH: ws },
      }),
    });
    assert(post.ok, `scoped POST mcps ${post.status}`);
    const body = await post.json();
    assert(body.backend === "filesystem", "filesystem added");
    assert(body.workspace_path === ws, "workspace path echoed");

    const disable = await fetch(`${origin}/api/workspaces/${wsId}/mcps/filesystem`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ enabled: false }),
    });
    assert(disable.ok, `scoped PATCH disable mcp ${disable.status}`);
    const disabled = await disable.json();
    assert(disabled.ok === true, "disable ok");
    const cfgOff = JSON.parse(readFileSync(mcpPath, "utf8"));
    assert(!cfgOff.mcpServers.filesystem, "filesystem removed from project mcp.json");

    const enable = await fetch(`${origin}/api/workspaces/${wsId}/mcps/filesystem`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ enabled: true }),
    });
    assert(enable.ok, `scoped PATCH enable mcp ${enable.status}`);
    const cfgOn = JSON.parse(readFileSync(mcpPath, "utf8"));
    assert(cfgOn.mcpServers.filesystem?.command === "npx", "filesystem restored");

    const toolPatch = await fetch(`${origin}/api/workspaces/${wsId}/tools/fork_repository`, {
      method: "PATCH",
      headers: writeAuthHeaders("PATCH"),
      body: JSON.stringify({ force_tier: "hidden" }),
    });
    assert(toolPatch.ok, `scoped PATCH tool ${toolPatch.status}`);

    const health = await fetch(`${origin}/api/health`).then((r) => r.json());
    assert(health.version === "31a", "dashboard health version");

    console.error("[workspaces] HTTP scoped API ok");
  } finally {
    delete process.env.COSTGATE_WORKSPACE_REGISTRY;
    await new Promise((resolve) => server.close(resolve));
  }
}

function testCollapseNestedInList() {
  const base = tempRoot();
  const regPath = join(base, "registry.json");
  const mono = join(base, "costgate");
  const pkg = join(mono, "packages", "gate");
  setupWorkspace(mono);
  mkdirSync(pkg, { recursive: true });
  touchRegistryPath(mono, { registryPath: regPath, source: "cursor:workspace" });
  touchRegistryPath(pkg, { registryPath: regPath, source: "cursor:file" });
  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces.length === 1, "nested entry collapsed in list");
  assert(list.workspaces[0].path === resolve(mono), "parent root shown");
  console.error("[workspaces] collapse nested list ok");
}

async function main() {
  testEncodeDecode();
  testScopedPaths();
  testPinAndList();
  testRegistrySource();
  testSkipMissingRegistryPaths();
  testCollapseNestedInList();
  await testHttpScopedApi();
  console.error("[workspaces] all passed");
}

main().catch((e) => {
  console.error("[workspaces] fatal:", e);
  process.exit(1);
});
