#!/usr/bin/env node
/**
 * Merge CostGate Cursor hooks into ~/.cursor/hooks.json
 *  · workspace registry (workspaceOpen / Read / Tab)
 *  · prompt intent (beforeSubmitPrompt)
 *  · shield prompt secret block (beforeSubmitPrompt)
 *  · shield MCP trust (beforeMCPExecution)
 *  · shield Read sanitizer (preToolUse / Read)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
export const REGISTRY_SCRIPT = join(ROOT, "cursor-registry-hook.mjs");
export const PROMPT_SCRIPT = join(ROOT, "cursor-prompt-intent-hook.mjs");
export const SHIELD_PROMPT_SCRIPT = join(ROOT, "cursor-shield-prompt-hook.mjs");
export const SHIELD_MCP_SCRIPT = join(ROOT, "cursor-shield-mcp-hook.mjs");
export const SHIELD_READ_SCRIPT = join(ROOT, "cursor-shield-read-hook.mjs");
const CURSOR_DIR = join(homedir(), ".cursor");
export const DEFAULT_HOOKS_PATH = join(CURSOR_DIR, "hooks.json");

/** Shared Shield env for hook processes (vault session aligns with Gate COSTGATE_CLIENT=cursor). */
export const SHIELD_HOOK_ENV = {
  COSTGATE_SHIELD: "1",
  COSTGATE_SHIELD_SESSION: "cursor",
};

export function buildHookDefs() {
  return [
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
    {
      key: "beforeSubmitPrompt",
      script: SHIELD_PROMPT_SCRIPT,
      hook: {
        command: `node ${SHIELD_PROMPT_SCRIPT}`,
        timeout: 5,
        failClosed: true,
        env: { ...SHIELD_HOOK_ENV, COSTGATE_SHIELD_PROMPT: "1" },
      },
    },
    {
      key: "beforeMCPExecution",
      script: SHIELD_MCP_SCRIPT,
      hook: {
        command: `node ${SHIELD_MCP_SCRIPT}`,
        timeout: 5,
        failClosed: true,
        env: { ...SHIELD_HOOK_ENV },
      },
    },
    {
      key: "preToolUse",
      script: SHIELD_READ_SCRIPT,
      hook: {
        command: `node ${SHIELD_READ_SCRIPT}`,
        timeout: 15,
        matcher: "Read",
        env: { ...SHIELD_HOOK_ENV },
      },
    },
  ];
}

export function loadHooks(hooksPath = DEFAULT_HOOKS_PATH) {
  if (!existsSync(hooksPath)) {
    return { version: 1, hooks: {} };
  }
  try {
    const data = JSON.parse(readFileSync(hooksPath, "utf8"));
    return { version: data.version ?? 1, hooks: data.hooks ?? {} };
  } catch {
    return { version: 1, hooks: {} };
  }
}

export function scriptBasename(scriptPath) {
  return scriptPath.split("/").pop();
}

export function findHookIndex(list, scriptName) {
  return (list ?? []).findIndex((h) => String(h.command ?? "").includes(scriptName));
}

/** Insert or merge a CostGate hook entry (env / matcher / failClosed). Returns true if changed. */
export function ensureHookEntry(list, scriptName, hook) {
  const hooks = list ?? [];
  const idx = findHookIndex(hooks, scriptName);
  if (idx === -1) {
    hooks.push({ ...hook });
    return true;
  }

  const existing = hooks[idx];
  let changed = false;

  if (hook.env) {
    const merged = { ...existing.env, ...hook.env };
    const envChanged =
      JSON.stringify(existing.env ?? {}) !== JSON.stringify(merged);
    if (envChanged) {
      existing.env = merged;
      changed = true;
    }
  }

  for (const field of ["matcher", "failClosed", "timeout"]) {
    if (hook[field] !== undefined && existing[field] !== hook[field]) {
      existing[field] = hook[field];
      changed = true;
    }
  }

  return changed;
}

/** Merge CostGate hook definitions into an existing hooks.json config. */
export function mergeCostGateHooks(config) {
  const installed = [];
  for (const { key, script, hook } of buildHookDefs()) {
    const scriptName = scriptBasename(script);
    config.hooks[key] ??= [];
    if (ensureHookEntry(config.hooks[key], scriptName, hook)) {
      installed.push(key);
    }
  }
  return { config, installed };
}

export function installCursorRegistryHooks(hooksPath = DEFAULT_HOOKS_PATH) {
  mkdirSync(join(hooksPath, ".."), { recursive: true });
  const config = loadHooks(hooksPath);
  const { config: merged, installed } = mergeCostGateHooks(config);
  writeFileSync(hooksPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { hooksPath, installed, config: merged };
}

function main() {
  const { hooksPath, installed } = installCursorRegistryHooks();
  console.error(`[cursor:hooks] → ${hooksPath}`);
  console.error(`[cursor:hooks] added: ${installed.length ? installed.join(", ") : "(already present)"}`);
  console.error(`[cursor:hooks] registry: ${REGISTRY_SCRIPT}`);
  console.error(`[cursor:hooks] prompt-intent: ${PROMPT_SCRIPT}`);
  console.error(`[cursor:hooks] shield-prompt: ${SHIELD_PROMPT_SCRIPT}`);
  console.error(`[cursor:hooks] shield-mcp: ${SHIELD_MCP_SCRIPT}`);
  console.error(`[cursor:hooks] shield-read: ${SHIELD_READ_SCRIPT}`);
  console.error("[cursor:hooks] Restart Cursor after install.");
  console.error(
    "[cursor:hooks] Transcript tail (opt-in): COSTGATE_PROMPT_INTENT_TRANSCRIPT=1 on the hook process."
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
