/**
 * Shared Cursor hooks.json helpers (install + Dashboard shield settings).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const REGISTRY_SCRIPT = join(SCRIPTS_ROOT, "cursor-registry-hook.mjs");
export const PROMPT_SCRIPT = join(SCRIPTS_ROOT, "cursor-prompt-intent-hook.mjs");
export const SHIELD_PROMPT_SCRIPT = join(SCRIPTS_ROOT, "cursor-shield-prompt-hook.mjs");
export const SHIELD_MCP_SCRIPT = join(SCRIPTS_ROOT, "cursor-shield-mcp-hook.mjs");
export const SHIELD_READ_SCRIPT = join(SCRIPTS_ROOT, "cursor-shield-read-hook.mjs");

const CURSOR_DIR = join(homedir(), ".cursor");
export const DEFAULT_HOOKS_PATH = join(CURSOR_DIR, "hooks.json");

export const SHIELD_HOOK_ENV = {
  COSTGATE_SHIELD: "1",
  COSTGATE_SHIELD_SESSION: "cursor",
};

export function defaultHooksPath() {
  return process.env.CURSOR_HOOKS_PATH ?? DEFAULT_HOOKS_PATH;
}

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

export function loadHooks(hooksPath = defaultHooksPath()) {
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

export function writeHooks(config, hooksPath = defaultHooksPath()) {
  mkdirSync(dirname(hooksPath), { recursive: true });
  writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function scriptBasename(scriptPath) {
  return scriptPath.split("/").pop();
}

export function findHookIndex(list, scriptName) {
  return (list ?? []).findIndex((h) => String(h.command ?? "").includes(scriptName));
}

export function removeHookEntry(list, scriptName) {
  const hooks = list ?? [];
  const idx = findHookIndex(hooks, scriptName);
  if (idx === -1) return false;
  hooks.splice(idx, 1);
  return true;
}

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
    const envChanged = JSON.stringify(existing.env ?? {}) !== JSON.stringify(merged);
    if (envChanged) {
      existing.env = merged;
      changed = true;
    }
  }

  for (const field of ["matcher", "failClosed", "timeout", "command"]) {
    if (hook[field] !== undefined && existing[field] !== hook[field]) {
      existing[field] = hook[field];
      changed = true;
    }
  }

  return changed;
}
