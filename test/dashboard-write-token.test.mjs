#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  dashboardWriteTokenPath,
  isLoopbackAddress,
  resolveDashboardWriteToken,
} from "../scripts/lib/dashboard-write-token.mjs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testResolvePersistsAndReuses() {
  const base = join(tmpdir(), `costgate-wt-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  const tokenPath = join(base, "dashboard-write-token");
  const env = { HOME: base, USERPROFILE: base };
  delete env.COSTGATE_DASHBOARD_TOKEN;

  const first = resolveDashboardWriteToken({ env, tokenPath });
  assert(first.source === "generated", "first generate");
  assert(first.bootstrappable === true, "bootstrappable");
  assert(readFileSync(tokenPath, "utf8").trim() === first.token, "persisted");

  const second = resolveDashboardWriteToken({ env, tokenPath });
  assert(second.source === "file", "reuse file");
  assert(second.token === first.token, "stable across restarts");

  const fromEnv = resolveDashboardWriteToken({
    env: { ...env, COSTGATE_DASHBOARD_TOKEN: "env-token" },
    tokenPath,
  });
  assert(fromEnv.source === "env" && fromEnv.token === "env-token", "env wins");

  assert(isLoopbackAddress("127.0.0.1"), "loopback v4");
  assert(isLoopbackAddress("::1"), "loopback v6");
  assert(!isLoopbackAddress("192.168.1.1"), "not lan");
  assert(dashboardWriteTokenPath(env).includes(".costgate"), "default path under home");

  rmSync(base, { recursive: true, force: true });
  console.error("[write-token] resolve ok");
}

async function testHealthBootstrapOnLoopback() {
  const base = join(tmpdir(), `costgate-wt-http-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  const tokenPath = join(base, "dashboard-write-token");
  writeFileSync(join(base, "backends.json"), JSON.stringify({ backends: {} }));
  writeFileSync(join(base, "mcp.json"), JSON.stringify({ mcpServers: {} }));
  mkdirSync(join(base, "logs"), { recursive: true });

  const prev = process.env.COSTGATE_DASHBOARD_TOKEN;
  const prevFile = process.env.COSTGATE_DASHBOARD_TOKEN_FILE;
  delete process.env.COSTGATE_DASHBOARD_TOKEN;
  process.env.COSTGATE_DASHBOARD_TOKEN_FILE = tokenPath;

  const server = createDashboardServer({
    dataOptions: {
      logDir: join(base, "logs"),
      configPath: join(base, "backends.json"),
      mcpPath: join(base, "mcp.json"),
    },
    controlPaths: {
      configPath: join(base, "backends.json"),
      mcpPath: join(base, "mcp.json"),
    },
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    assert(health.writes?.token_required === true, "token required");
    assert(typeof health.writes?.bootstrap_token === "string", "bootstrap present");
    assert(health.writes.bootstrap_token === server.costgateWriteToken, "matches server");

    const denied = await fetch(`http://127.0.0.1:${port}/api/mcps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "memory", env: {} }),
    });
    assert(denied.status === 401, "no header → 401");

    const ok = await fetch(`http://127.0.0.1:${port}/api/gate-settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Costgate-Dashboard-Token": health.writes.bootstrap_token,
      },
      body: JSON.stringify({ settings: { intent_probe: false } }),
    });
    assert(ok.ok, `write with bootstrap token ${ok.status}`);
    console.error("[write-token] health bootstrap ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (prev === undefined) delete process.env.COSTGATE_DASHBOARD_TOKEN;
    else process.env.COSTGATE_DASHBOARD_TOKEN = prev;
    if (prevFile === undefined) delete process.env.COSTGATE_DASHBOARD_TOKEN_FILE;
    else process.env.COSTGATE_DASHBOARD_TOKEN_FILE = prevFile;
    rmSync(base, { recursive: true, force: true });
  }
}

await testResolvePersistsAndReuses();
await testHealthBootstrapOnLoopback();
console.error("[write-token] all passed");
