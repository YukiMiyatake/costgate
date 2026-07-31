/**
 * Shared Cursor hooks.json helpers (install + Dashboard shield settings).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** CostGate hook script basenames (used for match / dedupe / order). */
export const COSTGATE_HOOK_SCRIPTS = [
  "cursor-registry-hook.mjs",
  "cursor-prompt-intent-hook.mjs",
  "cursor-shield-prompt-hook.mjs",
  "cursor-shield-mcp-hook.mjs",
  "cursor-shield-read-hook.mjs",
];

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

function falsyEnv(v) {
  return v === "0" || v === "false" || v === "no";
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

export function isWslEnv(env = process.env) {
  return Boolean(env.WSL_DISTRO_NAME || env.WSLENV);
}

/** Convert `C:\Users\x` → `/mnt/c/Users/x` (WSL mount). */
export function windowsPathToWslMount(winPath) {
  const normalized = String(winPath).trim().replace(/\\/g, "/");
  const m = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!m) return null;
  return `/mnt/${m[1].toLowerCase()}/${m[2]}`;
}

/** Read Windows %USERPROFILE% via cmd.exe (WSL interop). */
export function windowsUserProfile(env = process.env) {
  if (env.COSTGATE_WINDOWS_USERPROFILE) return env.COSTGATE_WINDOWS_USERPROFILE;
  try {
    const out = execFileSync("cmd.exe", ["/c", "echo", "%USERPROFILE%"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    const line = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    return line && /^[A-Za-z]:/.test(line) ? line : null;
  } catch {
    return null;
  }
}

/**
 * Windows Cursor user hooks path, readable from WSL (`/mnt/c/Users/.../.cursor/hooks.json`).
 * Override with COSTGATE_WINDOWS_HOOKS_PATH.
 */
export function detectWindowsCursorHooksPath(env = process.env) {
  if (env.COSTGATE_WINDOWS_HOOKS_PATH) return env.COSTGATE_WINDOWS_HOOKS_PATH;
  const profile = windowsUserProfile(env);
  if (!profile) return null;
  const mount = windowsPathToWslMount(profile);
  if (!mount) return null;
  return join(mount, ".cursor", "hooks.json");
}

/**
 * Where to write hooks.json.
 * In WSL, also update Windows Cursor's hooks (all workspaces on that host)
 * unless COSTGATE_HOOKS_WINDOWS=0.
 */
export function resolveHooksInstallTargets(options = {}) {
  const env = options.env ?? process.env;
  const primary = options.hooksPath ?? defaultHooksPath();
  const targets = [
    {
      hooksPath: primary,
      platform: hooksPlatform(options.platform ?? process.platform),
      label: "primary",
    },
  ];

  const wantWindows =
    !falsyEnv(env.COSTGATE_HOOKS_WINDOWS) &&
    (truthyEnv(env.COSTGATE_HOOKS_WINDOWS) ||
      truthyEnv(env.COSTGATE_CURSOR_HOST_WINDOWS) ||
      isWslEnv(env));

  if (wantWindows && isWslEnv(env)) {
    const winPath = detectWindowsCursorHooksPath(env);
    if (winPath && winPath !== primary) {
      targets.push({ hooksPath: winPath, platform: "win32", label: "windows-cursor" });
    }
  }

  return targets;
}

/**
 * Normalize script paths for the Cursor host that will run hooks.
 * - Git Bash / MSYS: `/e/Work/...` → `E:\Work\...` (first segment is a single letter)
 * - WSL mount when targeting win32: `/mnt/e/Work/...` → `E:\Work\...`
 * - Cursor style: `/c:/Users/...` → `C:\Users\...`
 * Does not rewrite Unix roots like `/etc/...` or `/home/...`.
 */
export function toHookScriptPath(scriptPath, options = {}) {
  const plat = hooksPlatform(options.platform);
  let p = String(scriptPath).replace(/\\/g, "/");

  if (plat === "win32") {
    const wslMount = p.match(/^\/mnt\/([A-Za-z])\/(.*)$/);
    if (wslMount) {
      p = `${wslMount[1].toUpperCase()}:/${wslMount[2]}`;
      return p.replace(/\//g, "\\");
    }

    const parts = p.split("/").filter(Boolean);
    if (parts.length >= 2 && /^[A-Za-z]$/.test(parts[0])) {
      // MSYS: /e/Work/wsl/...
      p = `${parts[0].toUpperCase()}:/${parts.slice(1).join("/")}`;
    } else if (parts.length >= 1 && /^[A-Za-z]:$/.test(parts[0])) {
      // /e:/Work/... or normalizeCursorPath-style /c:/Users/...
      p = `${parts[0].toUpperCase()}/${parts.slice(1).join("/")}`;
    } else {
      p = normalizeCursorPath(p);
    }
    return p.replace(/\//g, "\\");
  }

  return normalizeCursorPath(p);
}

/**
 * Build a Cursor hook `command` that works on Windows (cmd /c + quoted path)
 * and POSIX (quoted path).
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

/**
 * Load hooks.json. On corrupt JSON, backup and return empty config
 * (caller should write only after merge — backup preserves the broken file).
 */
export function loadHooks(hooksPath = defaultHooksPath()) {
  if (!existsSync(hooksPath)) {
    return { version: 1, hooks: {} };
  }
  try {
    const data = JSON.parse(readFileSync(hooksPath, "utf8"));
    return { version: data.version ?? 1, hooks: data.hooks ?? {} };
  } catch (err) {
    const backup = `${hooksPath}.corrupt.${Date.now()}.bak`;
    try {
      copyFileSync(hooksPath, backup);
      console.error(`[cursor:hooks] corrupt hooks.json backed up → ${backup}`);
      console.error(`[cursor:hooks] parse error: ${err?.message ?? err}`);
    } catch {
      // ignore backup failures
    }
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

/**
 * True when `command` invokes the CostGate script basename as a path segment
 * (not a coincidental substring in an echo/comment).
 */
export function commandInvokesScript(command, scriptName) {
  const cmd = String(command ?? "").replace(/\\/g, "/");
  const name = scriptBasename(scriptName);
  if (!name || !cmd) return false;
  // Match .../name or ...\name, optionally quoted, as a path ending or followed by quote/space
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[/\\\\"])${escaped}(?:["'\\s]|$)`);
  return re.test(cmd);
}

export function findHookIndex(list, scriptName) {
  return (list ?? []).findIndex((h) => commandInvokesScript(h.command, scriptName));
}

export function findAllHookIndices(list, scriptName) {
  const out = [];
  (list ?? []).forEach((h, i) => {
    if (commandInvokesScript(h.command, scriptName)) out.push(i);
  });
  return out;
}

/** Remove all entries that invoke scriptName. Returns count removed. */
export function removeHookEntry(list, scriptName) {
  const hooks = list ?? [];
  let removed = 0;
  for (let i = hooks.length - 1; i >= 0; i -= 1) {
    if (commandInvokesScript(hooks[i].command, scriptName)) {
      hooks.splice(i, 1);
      removed += 1;
    }
  }
  return removed > 0;
}

/**
 * Upsert a CostGate hook: full replace (drops stale matcher/env/failClosed),
 * and remove duplicate entries for the same script.
 */
export function ensureHookEntry(list, scriptName, hook) {
  const hooks = list ?? [];
  const indices = findAllHookIndices(hooks, scriptName);
  const next = { ...hook };
  if (indices.length === 0) {
    hooks.push(next);
    return true;
  }

  const primary = indices[0];
  const prev = JSON.stringify(hooks[primary]);
  hooks[primary] = next;
  // Drop duplicates (higher indices first)
  for (let i = indices.length - 1; i >= 1; i -= 1) {
    hooks.splice(indices[i], 1);
  }
  return prev !== JSON.stringify(next) || indices.length > 1;
}

/**
 * Ensure beforeSubmitPrompt order: prompt-intent, then shield-prompt, then others.
 */
export function orderBeforeSubmitPrompt(list) {
  const hooks = list ?? [];
  const intent = [];
  const shield = [];
  const other = [];
  for (const h of hooks) {
    if (commandInvokesScript(h.command, "cursor-prompt-intent-hook.mjs")) intent.push(h);
    else if (commandInvokesScript(h.command, "cursor-shield-prompt-hook.mjs")) shield.push(h);
    else other.push(h);
  }
  const ordered = [...intent, ...shield, ...other];
  const changed = JSON.stringify(ordered) !== JSON.stringify(hooks);
  if (changed) {
    hooks.length = 0;
    hooks.push(...ordered);
  }
  return changed;
}

/** Strip leftover CostGate failClosed duplicates and normalize beforeSubmitPrompt order. */
export function finalizeCostGateHooks(config) {
  config.hooks ??= {};
  let changed = false;
  if (config.hooks.beforeSubmitPrompt) {
    if (orderBeforeSubmitPrompt(config.hooks.beforeSubmitPrompt)) changed = true;
  }
  return changed;
}
