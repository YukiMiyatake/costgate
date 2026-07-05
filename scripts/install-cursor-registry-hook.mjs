#!/usr/bin/env node
/**
 * Merge CostGate Cursor hooks into ~/.cursor/hooks.json
 *  · workspace registry (workspaceOpen / Read / Tab)
 *  · prompt intent (beforeSubmitPrompt)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const REGISTRY_SCRIPT = join(ROOT, "cursor-registry-hook.mjs");
const PROMPT_SCRIPT = join(ROOT, "cursor-prompt-intent-hook.mjs");
const CURSOR_DIR = join(homedir(), ".cursor");
const HOOKS_PATH = join(CURSOR_DIR, "hooks.json");

const HOOK_DEFS = [
  {
    key: "workspaceOpen",
    script: REGISTRY_SCRIPT,
    hook: { command: `node ${REGISTRY_SCRIPT}`, timeout: 30 },
  },
  {
    key: "postToolUse",
    script: REGISTRY_SCRIPT,
    hook: { command: `node ${REGISTRY_SCRIPT}`, timeout: 30, matcher: "Read" },
  },
  {
    key: "beforeTabFileRead",
    script: REGISTRY_SCRIPT,
    hook: { command: `node ${REGISTRY_SCRIPT}`, timeout: 30 },
  },
  {
    key: "beforeSubmitPrompt",
    script: PROMPT_SCRIPT,
    hook: { command: `node ${PROMPT_SCRIPT}`, timeout: 5 },
  },
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

function hasScript(list, scriptName) {
  return (list ?? []).some((h) => String(h.command ?? "").includes(scriptName));
}

function main() {
  mkdirSync(CURSOR_DIR, { recursive: true });
  const config = loadHooks();
  const installed = [];
  for (const { key, script, hook } of HOOK_DEFS) {
    const scriptName = script.split("/").pop();
    config.hooks[key] ??= [];
    if (!hasScript(config.hooks[key], scriptName)) {
      config.hooks[key].push(hook);
      installed.push(key);
    }
  }
  writeFileSync(HOOKS_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.error(`[cursor:hooks] → ${HOOKS_PATH}`);
  console.error(`[cursor:hooks] added: ${installed.length ? installed.join(", ") : "(already present)"}`);
  console.error(`[cursor:hooks] registry: ${REGISTRY_SCRIPT}`);
  console.error(`[cursor:hooks] prompt-intent: ${PROMPT_SCRIPT}`);
  console.error("[cursor:hooks] Restart Cursor after install.");
  console.error(
    "[cursor:hooks] Transcript tail (opt-in): COSTGATE_PROMPT_INTENT_TRANSCRIPT=1 on the hook process."
  );
}

main();
