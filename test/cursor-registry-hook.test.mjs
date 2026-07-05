#!/usr/bin/env node
/**
 * Cursor registry hook — workspaceOpen handling.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleCursorRegistryHook } from "../scripts/cursor-registry-hook.mjs";
import { listWorkspaces } from "../scripts/lib/dashboard-workspaces.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempReg() {
  const base = join(tmpdir(), `costgate-cursor-hook-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  const regPath = join(base, "registry.json");
  writeFileSync(regPath, JSON.stringify({ version: 1, workspaces: [] }, null, 2));
  process.env.COSTGATE_WORKSPACE_REGISTRY = regPath;
  return { base, regPath };
}

function testWorkspaceOpen() {
  const { base, regPath } = tempReg();
  const ws = join(base, "my-app");
  mkdirSync(ws, { recursive: true });
  mkdirSync(join(ws, ".git"), { recursive: true });

  const result = handleCursorRegistryHook({
    hook_event_name: "workspaceOpen",
    workspace_roots: [ws],
  });
  assert(result.ok === true, "ok");
  assert(result.touched.length === 1, "touched one");

  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces.length === 1, "registry entry");
  assert(list.workspaces[0].source === "cursor:workspace", "cursor:workspace source");
  console.error("[cursor-hook] workspaceOpen ok");
  delete process.env.COSTGATE_WORKSPACE_REGISTRY;
}

function testUnknownEvent() {
  const result = handleCursorRegistryHook({ hook_event_name: "sessionStart" });
  assert(result.touched.length === 0, "no touch");
  console.error("[cursor-hook] unknown event ok");
}

async function main() {
  testWorkspaceOpen();
  testUnknownEvent();
  console.error("[cursor-hook] all passed");
}

main().catch((e) => {
  console.error("[cursor-hook] fatal:", e);
  process.exit(1);
});
