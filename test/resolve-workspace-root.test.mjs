#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  collapseNestedWorkspacePaths,
  findContainingWorkspaceRoot,
  isPathUnder,
  normalizeRegistryWorkspacePath,
  resolveWorkspaceRootFromPath,
} from "../scripts/lib/resolve-workspace-root.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempBase() {
  const base = join(tmpdir(), `costgate-ws-root-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  return base;
}

function testIsPathUnder() {
  assert(isPathUnder("/a/b/c", "/a"), "child under parent");
  assert(!isPathUnder("/a/b", "/a/x"), "different branch");
  console.error("[resolve-workspace-root] isPathUnder ok");
}

function testFindContainingRoot() {
  const root = "/work/costgate";
  const found = findContainingWorkspaceRoot("/work/costgate/packages/gate/foo.go", [
    root,
    "/work/other",
  ]);
  assert(found === root, "outermost known root");
  console.error("[resolve-workspace-root] findContaining ok");
}

function testNormalizePrefersKnownRoot() {
  const base = tempBase();
  const mono = join(base, "costgate");
  const pkg = join(mono, "packages", "gate");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "go.mod"), "module gate\n");
  const file = join(pkg, "internal", "x.go");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "package internal\n");

  const heuristic = resolveWorkspaceRootFromPath(file);
  assert(heuristic === pkg, "heuristic finds package");

  const normalized = normalizeRegistryWorkspacePath(file, [mono]);
  assert(normalized === mono, "known root wins over package heuristic");
  console.error("[resolve-workspace-root] normalize ok");
}

function testCollapseNested() {
  const items = collapseNestedWorkspacePaths([
    { path: "/work/costgate", label: "costgate" },
    { path: "/work/costgate/packages/gate", label: "gate" },
    { path: "/work/other", label: "other" },
  ]);
  assert(items.length === 2, "nested package collapsed");
  assert(items.some((i) => i.path.endsWith("costgate")), "parent kept");
  console.error("[resolve-workspace-root] collapse ok");
}

testIsPathUnder();
testFindContainingRoot();
testNormalizePrefersKnownRoot();
testCollapseNested();
console.error("[resolve-workspace-root] all passed");
