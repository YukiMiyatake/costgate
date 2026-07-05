#!/usr/bin/env node
/**
 * Merge CostGate workspace registry hooks into ~/.cursor/hooks.json
 *
 * Usage:
 *   npm run registry:install-cursor-hook
 *   npm run registry:install-cursor-hook -- --user   # default
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const HOOK_SCRIPT = join(ROOT, "cursor-registry-hook.mjs");
const CURSOR_DIR = join(homedir(), ".cursor");
const HOOKS_PATH = join(CURSOR_DIR, "hooks.json");

const WORKSPACE_OPEN = {
  command: `node ${HOOK_SCRIPT}`,
  timeout: 30,
};

function loadHooks() {
  if (!existsSync(HOOKS_PATH)) {
    return { version: 1, hooks: {} };
  }
  try {
    const data = JSON.parse(readFileSync(HOOKS_PATH, "utf8"));
    return { version: data.version ?? 1, hooks: data.hooks ?? {} };
  } catch {
    return { version: 1, hooks: {} };
  }
}

function hasCommand(list, needle) {
  return (list ?? []).some((h) => String(h.command ?? "").includes("cursor-registry-hook.mjs"));
}

function main() {
  mkdirSync(CURSOR_DIR, { recursive: true });
  const config = loadHooks();
  config.hooks.workspaceOpen ??= [];
  if (!hasCommand(config.hooks.workspaceOpen)) {
    config.hooks.workspaceOpen.push(WORKSPACE_OPEN);
  }
  writeFileSync(HOOKS_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.error(`[registry] installed workspaceOpen hook → ${HOOKS_PATH}`);
  console.error(`[registry] script: ${HOOK_SCRIPT}`);
  console.error("[registry] Restart Cursor or reload window. Check Output → Hooks for execution.");
}

main();
