#!/usr/bin/env node
/**
 * Cursor registry hook — workspaceOpen handling.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { handleCursorRegistryHook, extractFilePathFromHook } from "../scripts/cursor-registry-hook.mjs";
import { listWorkspaces, touchRegistryPath } from "../scripts/lib/dashboard-workspaces.mjs";
import { resolveWorkspaceRootFromPath } from "../scripts/lib/resolve-workspace-root.mjs";

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

function testPostToolUseRead() {
  const { base, regPath } = tempReg();
  const ws = join(base, "repo");
  mkdirSync(join(ws, ".git"), { recursive: true });
  const file = join(ws, "src", "app.ts");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "// test\n");

  const result = handleCursorRegistryHook({
    hook_event_name: "postToolUse",
    tool_name: "Read",
    tool_input: { path: file },
  });
  assert(result.touched.length === 1, "touched repo");
  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces[0].source === "cursor:file", "cursor:file source");
  console.error("[cursor-hook] postToolUse Read ok");
  delete process.env.COSTGATE_WORKSPACE_REGISTRY;
}

function testBeforeTabFileRead() {
  const { base, regPath } = tempReg();
  const ws = join(base, "tab-project");
  mkdirSync(ws, { recursive: true });
  writeFileSync(join(ws, "package.json"), "{}");
  const file = join(ws, "index.js");
  writeFileSync(file, "console.log(1)\n");

  handleCursorRegistryHook({
    hook_event_name: "beforeTabFileRead",
    path: file,
  });
  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces.length === 1, "tab read registry");
  console.error("[cursor-hook] beforeTabFileRead ok");
  delete process.env.COSTGATE_WORKSPACE_REGISTRY;
}

function testResolveWorkspaceRoot() {
  const { base } = tempReg();
  const ws = join(base, "nested", "proj");
  mkdirSync(join(ws, ".git"), { recursive: true });
  const file = join(ws, "a", "b.txt");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "x");
  assert(resolveWorkspaceRootFromPath(file) === ws, "git root from file");
  delete process.env.COSTGATE_WORKSPACE_REGISTRY;
  console.error("[cursor-hook] resolve root ok");
}

function testMonorepoFileFoldsToWorkspaceRoot() {
  const { base, regPath } = tempReg();
  const mono = join(base, "costgate");
  mkdirSync(join(mono, ".git"), { recursive: true });
  const pkg = join(mono, "packages", "gate");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "go.mod"), "module gate\n");
  const file = join(pkg, "main.go");
  writeFileSync(file, "package main\n");

  touchRegistryPath(mono, { registryPath: regPath, source: "cursor:workspace" });

  handleCursorRegistryHook({
    hook_event_name: "postToolUse",
    tool_name: "Read",
    tool_input: { path: file },
    workspace_roots: [mono],
  });

  const list = listWorkspaces({ registryPath: regPath, includeCurrent: false });
  assert(list.workspaces.length === 1, "single workspace after fold");
  assert(resolve(list.workspaces[0].path) === resolve(mono), "monorepo root not package");
  console.error("[cursor-hook] monorepo fold ok");
  delete process.env.COSTGATE_WORKSPACE_REGISTRY;
}

async function main() {
  testWorkspaceOpen();
  testPostToolUseRead();
  testBeforeTabFileRead();
  testResolveWorkspaceRoot();
  testMonorepoFileFoldsToWorkspaceRoot();
  testUnknownEvent();
  console.error("[cursor-hook] all passed");
}

main().catch((e) => {
  console.error("[cursor-hook] fatal:", e);
  process.exit(1);
});
