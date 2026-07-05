#!/usr/bin/env node
/**
 * Merge CostGate workspace registry hooks into ~/.cursor/hooks.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const HOOK_SCRIPT = join(ROOT, "cursor-registry-hook.mjs");
const CURSOR_DIR = join(homedir(), ".cursor");
const HOOKS_PATH = join(CURSOR_DIR, "hooks.json");

const HOOK_CMD = {
  command: `node ${HOOK_SCRIPT}`,
  timeout: 30,
};

const HOOK_DEFS = [
  { key: "workspaceOpen", hook: HOOK_CMD },
  { key: "postToolUse", hook: { ...HOOK_CMD, matcher: "Read" } },
  { key: "beforeTabFileRead", hook: HOOK_CMD },
];

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

function hasCommand(list) {
  return (list ?? []).some((h) => String(h.command ?? "").includes("cursor-registry-hook.mjs"));
}

function main() {
  mkdirSync(CURSOR_DIR, { recursive: true });
  const config = loadHooks();
  const installed = [];
  for (const { key, hook } of HOOK_DEFS) {
    config.hooks[key] ??= [];
    if (!hasCommand(config.hooks[key])) {
      config.hooks[key].push(hook);
      installed.push(key);
    }
  }
  writeFileSync(HOOKS_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.error(`[registry] hooks → ${HOOKS_PATH}`);
  console.error(`[registry] added: ${installed.length ? installed.join(", ") : "(already present)"}`);
  console.error(`[registry] script: ${HOOK_SCRIPT}`);
  console.error("[registry] Restart Cursor. Manual file open (sidebar) is not hooked — Agent/Tab reads are.");
}

main();
