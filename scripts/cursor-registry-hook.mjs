#!/usr/bin/env node
/**
 * Cursor hook: record workspace folders in CostGate Activity Registry.
 *
 * Events:
 *   workspaceOpen     → cursor:workspace
 *   postToolUse Read  → cursor:file (Agent)
 *   beforeTabFileRead → cursor:file (Tab)
 *
 * Install: npm run cursor:registry
 */
import { touchRegistryPath, loadRegistry, registryPath } from "./lib/dashboard-workspaces.mjs";
import { normalizeCursorPath, readHookStdin } from "./lib/cursor-hook-io.mjs";
import { normalizeRegistryWorkspacePath } from "./lib/resolve-workspace-root.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function extractFilePathFromHook(payload) {
  const ti = payload.tool_input ?? payload.input ?? payload;
  const raw =
    ti.path ??
    ti.file_path ??
    ti.filePath ??
    payload.path ??
    payload.file_path ??
    null;
  return raw == null ? null : normalizeCursorPath(raw);
}

function touchFileActivity(filePath, touched, payload) {
  const reg = loadRegistry(registryPath());
  const knownRoots = [
    ...(payload.workspace_roots ?? []).map((r) => normalizeCursorPath(r)),
    ...reg.workspaces.map((w) => w.path),
  ];
  const root = normalizeRegistryWorkspacePath(filePath, knownRoots);
  if (!root) return;
  touchRegistryPath(root, { source: "cursor:file", knownRoots });
  if (!touched.includes(root)) touched.push(root);
}

export function handleCursorRegistryHook(payload) {
  const event = payload?.hook_event_name ?? payload?.event ?? "";
  const touched = [];

  if (event === "workspaceOpen") {
    for (const root of payload.workspace_roots ?? []) {
      if (!root) continue;
      const normalized = normalizeCursorPath(root);
      touchRegistryPath(normalized, { source: "cursor:workspace" });
      touched.push(resolve(normalized));
    }
  }

  if (event === "postToolUse") {
    const tool = String(payload.tool_name ?? payload.tool ?? "");
    if (tool === "Read" || tool.endsWith(" Read")) {
      const filePath = extractFilePathFromHook(payload);
      if (filePath) touchFileActivity(filePath, touched, payload);
    }
  }

  if (event === "beforeTabFileRead") {
    const filePath = extractFilePathFromHook(payload);
    if (filePath) touchFileActivity(filePath, touched, payload);
  }

  return { ok: true, event, touched };
}

async function main() {
  const raw = (await readHookStdin()).trim();
  if (!raw) {
    process.stdout.write("{}\n");
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("[cursor-registry-hook] invalid JSON on stdin\n");
    process.exit(0);
  }
  const result = handleCursorRegistryHook(payload);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[cursor-registry-hook] ${e.message ?? e}\n`);
    process.exit(0);
  });
}
