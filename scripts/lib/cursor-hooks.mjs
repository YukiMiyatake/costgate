/**
 * Shared Cursor hooks.json helpers (install + Dashboard shield settings).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCursorPath } from "./cursor-hook-io.mjs";

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

/** Effective platform for hooks.json commands (override via COSTGATE_HOOKS_PLATFORM). */
export function hooksPlatform(platform = process.platform) {
  return process.env.COSTGATE_HOOKS_PLATFORM || platform;
}

function truthyEnv(v) {
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Cursor hooks.json `failClosed` default.
 *
 * Must stay off by default: Cursor's `MainThreadShellExec not initialized` is treated
 * as a hook failure and, with failClosed, blocks Agent across every workspace.
 * Opt in with COSTGATE_HOOKS_FAIL_CLOSED=1 when you accept that risk.
 */
export function hooksFailClosed(env = process.env) {
  return truthyEnv(env.COSTGATE_HOOKS_FAIL_CLOSED);
}

/**
 * Normalize script paths for the Cursor host that will run hooks.
 * Git Bash / MSYS often yields `/e/Work/...` which cmd.exe cannot execute.
 */
export function toHookScriptPath(scriptPath, options = {}) {
  const plat = hooksPlatform(options.platform);
  let p = String(scriptPath).replace(/\\/g, "/");
  // MSYS: /e/Work/...  or  /e:/Work/...
  const msys = p.match(/^\/([A-Za-z])(?:\:)?\/(.*)$/);
  if (msys && plat === "win32") {
    p = `${msys[1].toUpperCase()}:/${msys[2]}`;
  } else {
    p = normalizeCursorPath(p);
  }
  if (plat === "win32") {
    return p.replace(/\//g, "\\");
  }
  return p;
}

/**
 * Build a Cursor hook `command` that works on Windows (cmd /c + quoted path)
 * and POSIX (quoted path). Unquoted paths and bare `node …` break Cursor's
 * Windows launcher; failClosed + spawn errors wedge Agent in every workspace.
 */
export function formatHookCommand(scriptPath, options = {}) {
  const plat = hooksPlatform(options.platform);
  const nodeBin = options.nodeBin ?? "node";
  const path = toHookScriptPath(scriptPath, options);
  const quoted =
    plat === "win32" ? `"${path.replace(/"/g, '""')}"` : `"${path.replace(/(["\\$`])/g, "\\$1")}"`;
  const invoke = `${nodeBin} ${quoted}`;
  return plat === "win32" ? `cmd /c ${invoke}` : invoke;
}

export function buildHookDefs(options = {}) {
  const cmd = (script) => formatHookCommand(script, options);
  const failClosed = options.failClosed ?? hooksFailClosed(options.env ?? process.env);
  const shieldPrompt = {
    command: cmd(SHIELD_PROMPT_SCRIPT),
    timeout: 5,
    env: { ...SHIELD_HOOK_ENV, COSTGATE_SHIELD_PROMPT: "1" },
  };
  const shieldMcp = {
    command: cmd(SHIELD_MCP_SCRIPT),
    timeout: 5,
    env: { ...SHIELD_HOOK_ENV },
  };
  // Only set the key when true so upgrades can strip stale failClosed: true.
  if (failClosed) {
    shieldPrompt.failClosed = true;
    shieldMcp.failClosed = true;
  }

  return [
    {
      key: "workspaceOpen",
      script: REGISTRY_SCRIPT,
      hook: { command: cmd(REGISTRY_SCRIPT), timeout: 30 },
    },
    {
      key: "postToolUse",
      script: REGISTRY_SCRIPT,
      hook: { command: cmd(REGISTRY_SCRIPT), timeout: 30, matcher: "Read" },
    },
    {
      key: "beforeTabFileRead",
      script: REGISTRY_SCRIPT,
      hook: { command: cmd(REGISTRY_SCRIPT), timeout: 30 },
    },
    {
      key: "beforeSubmitPrompt",
      script: PROMPT_SCRIPT,
      hook: { command: cmd(PROMPT_SCRIPT), timeout: 5 },
    },
    {
      key: "beforeSubmitPrompt",
      script: SHIELD_PROMPT_SCRIPT,
      hook: shieldPrompt,
    },
    {
      key: "beforeMCPExecution",
      script: SHIELD_MCP_SCRIPT,
      hook: shieldMcp,
    },
    {
      key: "preToolUse",
      script: SHIELD_READ_SCRIPT,
      hook: {
        command: cmd(SHIELD_READ_SCRIPT),
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
  return String(scriptPath).replace(/\\/g, "/").split("/").pop();
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

  // Strip stale failClosed when the new def omits it (default fail-open).
  if (hook.failClosed === true) {
    if (existing.failClosed !== true) {
      existing.failClosed = true;
      changed = true;
    }
  } else if (Object.prototype.hasOwnProperty.call(existing, "failClosed")) {
    delete existing.failClosed;
    changed = true;
  }

  for (const field of ["matcher", "timeout", "command"]) {
    if (hook[field] !== undefined && existing[field] !== hook[field]) {
      existing[field] = hook[field];
      changed = true;
    }
  }

  return changed;
}
