#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addMcpServerRaw,
  deleteMcpServer,
  getMcpServerDetail,
  updateMcpServerConfig,
} from "../scripts/lib/mcp-crud.mjs";
import { loadMcpJson } from "../scripts/lib/dashboard-control.mjs";
import { loadBackendsJson } from "../scripts/lib/dashboard-marketplace.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const dir = join(tmpdir(), `costgate-mcp-crud-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function testBackendCrud() {
  const dir = tempDir();
  const mcpPath = join(dir, "mcp.json");
  const configPath = join(dir, "backends.json");
  const disabledPath = join(dir, "mcp-disabled.json");
  writeFileSync(
    mcpPath,
    JSON.stringify({ mcpServers: { "costgate-gate": { command: "/bin/gate" } } }, null, 2)
  );
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const paths = { mcpPath, configPath, disabledPath, globalConfigPath: configPath };
  const added = addMcpServerRaw(
    {
      name: "custom",
      target: "backend",
      config: { command: "echo", args: ["hi"] },
    },
    paths
  );
  assert(added.storage === "backend", "added backend");
  assert(!added.requires_cursor_restart, "backend add no cursor restart");

  const detail = getMcpServerDetail("custom", paths);
  assert(detail.config.command === "echo", "detail config");

  updateMcpServerConfig(
    "custom",
    { config: { command: "echo", args: ["updated"] } },
    paths
  );
  const backends = loadBackendsJson(configPath).backends;
  assert(backends.custom.args[0] === "updated", "updated backend");

  deleteMcpServer("custom", paths);
  assert(!loadBackendsJson(configPath).backends.custom, "deleted backend");
  console.error("[mcp-crud] backend crud ok");
}

function testDirectCrud() {
  const dir = tempDir();
  const mcpPath = join(dir, "mcp.json");
  const configPath = join(dir, "backends.json");
  const disabledPath = join(dir, "mcp-disabled.json");
  writeFileSync(
    mcpPath,
    JSON.stringify({ mcpServers: { "costgate-gate": { command: "/bin/gate" } } }, null, 2)
  );
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const paths = { mcpPath, configPath, disabledPath, globalConfigPath: configPath };
  addMcpServerRaw(
    {
      name: "remote",
      target: "direct",
      config: { url: "https://example.com/mcp" },
    },
    paths
  );
  const mcp = loadMcpJson(mcpPath);
  assert(mcp.mcpServers.remote.url === "https://example.com/mcp", "direct added");

  deleteMcpServer("remote", paths);
  assert(!loadMcpJson(mcpPath).mcpServers.remote, "direct deleted");
  console.error("[mcp-crud] direct crud ok");
}

async function testHttpCrud() {
  const dir = tempDir();
  const mcpPath = join(dir, "mcp.json");
  const configPath = join(dir, "backends.json");
  const disabledPath = join(dir, "disabled.json");
  writeFileSync(
    mcpPath,
    JSON.stringify({ mcpServers: { "costgate-gate": { command: "/bin/gate" } } }, null, 2)
  );
  writeFileSync(configPath, JSON.stringify({ backends: {} }, null, 2));

  const { createDashboardServer } = await import("../scripts/dashboard-server.mjs");
  const server = createDashboardServer({
    dataOptions: {
      logDir: join(dir, "logs"),
      usagePath: join(dir, "usage.json"),
      configPath,
      mcpPath,
      overridesPath: join(dir, "tool-overrides.json"),
      disabledPath,
      windowDays: 30,
    },
    controlPaths: { mcpPath, configPath, disabledPath },
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const post = await fetch(`${base}/api/mcps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "http-backend",
        target: "backend",
        config: { command: "echo", args: ["x"] },
      }),
    });
    assert(post.ok, `post ${post.status}`);
    const get = await fetch(`${base}/api/mcps/http-backend`);
    assert(get.ok, `get ${get.status}`);
    const body = await get.json();
    assert(body.storage === "backend", "http get storage");

    const put = await fetch(`${base}/api/mcps/http-backend`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { command: "echo", args: ["y"] } }),
    });
    assert(put.ok, `put ${put.status}`);

    const del = await fetch(`${base}/api/mcps/http-backend`, { method: "DELETE" });
    assert(del.ok, `delete ${del.status}`);
    console.error("[mcp-crud] HTTP crud ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testBackendCrud();
  testDirectCrud();
  await testHttpCrud();
  console.error("[mcp-crud] all passed");
}

main().catch((e) => {
  console.error("[mcp-crud] fatal:", e);
  process.exit(1);
});
