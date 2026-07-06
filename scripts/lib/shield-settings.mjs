/**
 * Prompt Shield settings — persisted + synced to ~/.cursor/hooks.json.
 * Global: ~/.costgate/shield-settings.json
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readJson } from "./read-json.mjs";
import {
  SHIELD_HOOK_ENV,
  SHIELD_PROMPT_SCRIPT,
  buildHookDefs,
  defaultHooksPath,
  findHookIndex,
  loadHooks,
  removeHookEntry,
  scriptBasename,
  writeHooks,
} from "./cursor-hooks.mjs";

export const SHIELD_SETTINGS_VERSION = 1;

export const DEFAULT_SHIELD_SETTINGS = {
  prompt_block: true,
  aggressive: false,
  fail_open: false,
};

export const SHIELD_SETTING_DEFS = [
  {
    key: "prompt_block",
    type: "boolean",
    label: "Prompt Shield (block secrets on submit)",
    hint: "beforeSubmitPrompt hook blocks prompts containing API keys and other secrets",
  },
  {
    key: "aggressive",
    type: "boolean",
    label: "Aggressive detection",
    hint: "Also block email, phone, paths, and env-style secrets",
  },
  {
    key: "fail_open",
    type: "boolean",
    label: "Fail open on hook errors",
    hint: "When off (default), hook errors block submit (fail-closed)",
  },
];

export function globalShieldSettingsPath() {
  return process.env.COSTGATE_SHIELD_SETTINGS_PATH ?? join(homedir(), ".costgate", "shield-settings.json");
}

function truthyEnv(v) {
  return v === "1" || v === "true" || v === "yes";
}

function normalizeShieldSettings(raw = {}) {
  const out = { version: SHIELD_SETTINGS_VERSION, ...DEFAULT_SHIELD_SETTINGS };
  for (const key of ["prompt_block", "aggressive", "fail_open"]) {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  }
  return out;
}

/** Read effective Prompt Shield toggle state from hooks.json. */
export function detectShieldSettingsFromHooks(hooksPath = defaultHooksPath()) {
  const config = loadHooks(hooksPath);
  const list = config.hooks?.beforeSubmitPrompt ?? [];
  const scriptName = scriptBasename(SHIELD_PROMPT_SCRIPT);
  const idx = findHookIndex(list, scriptName);
  if (idx === -1) {
    return normalizeShieldSettings({ prompt_block: false });
  }
  const env = list[idx].env ?? {};
  return normalizeShieldSettings({
    prompt_block: truthyEnv(env.COSTGATE_SHIELD_PROMPT) || truthyEnv(env.COSTGATE_SHIELD),
    aggressive: truthyEnv(env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE),
    fail_open: truthyEnv(env.COSTGATE_SHIELD_PROMPT_FAIL_OPEN),
  });
}

export function loadShieldSettings(hooksPath = defaultHooksPath()) {
  const path = globalShieldSettingsPath();
  const raw = readJson(path);
  if (raw) {
    return {
      settings: normalizeShieldSettings(raw),
      path,
      exists: true,
      hooks_path: hooksPath,
      hooks_exists: existsSync(hooksPath),
    };
  }
  return {
    settings: detectShieldSettingsFromHooks(hooksPath),
    path,
    exists: false,
    hooks_path: hooksPath,
    hooks_exists: existsSync(hooksPath),
  };
}

function shieldPromptHookFromSettings(settings) {
  const def = buildHookDefs().find((d) => d.script === SHIELD_PROMPT_SCRIPT);
  if (!def) throw new Error("shield prompt hook definition missing");
  const env = {
    ...SHIELD_HOOK_ENV,
    COSTGATE_SHIELD_PROMPT: "1",
  };
  if (settings.aggressive) env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE = "1";
  if (settings.fail_open) env.COSTGATE_SHIELD_PROMPT_FAIL_OPEN = "1";
  return { ...def.hook, env };
}

function backupHooks(hooksPath) {
  if (!existsSync(hooksPath)) return null;
  const backup = `${hooksPath}.bak`;
  copyFileSync(hooksPath, backup);
  return backup;
}

/** Install or remove the shield-prompt hook entry to match settings. */
export function applyShieldSettingsToHooks(settings, hooksPath = defaultHooksPath()) {
  const normalized = normalizeShieldSettings(settings);
  const config = loadHooks(hooksPath);
  config.hooks ??= {};
  config.hooks.beforeSubmitPrompt ??= [];
  const list = config.hooks.beforeSubmitPrompt;
  const scriptName = scriptBasename(SHIELD_PROMPT_SCRIPT);
  let changed = false;

  if (!normalized.prompt_block) {
    changed = removeHookEntry(list, scriptName);
  } else {
    const hook = shieldPromptHookFromSettings(normalized);
    const idx = findHookIndex(list, scriptName);
    if (idx === -1) {
      list.push(hook);
      changed = true;
    } else {
      const prev = JSON.stringify(list[idx]);
      list[idx] = { ...hook };
      changed = prev !== JSON.stringify(list[idx]);
    }
  }

  let backup = null;
  if (changed) {
    backup = backupHooks(hooksPath);
    writeHooks(config, hooksPath);
  }

  return {
    hooks_path: hooksPath,
    prompt_block_installed: normalized.prompt_block && findHookIndex(list, scriptName) !== -1,
    changed,
    backup,
    requires_cursor_restart: changed,
  };
}

export function saveShieldSettings(settings, hooksPath = defaultHooksPath()) {
  const path = globalShieldSettingsPath();
  const normalized = normalizeShieldSettings(settings);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  const hooks = applyShieldSettingsToHooks(normalized, hooksPath);
  return { path, settings: normalized, ...hooks };
}

export function patchShieldSettings(partial, hooksPath = defaultHooksPath()) {
  const current = loadShieldSettings(hooksPath).settings;
  const next = normalizeShieldSettings({ ...current, ...(partial.settings ?? partial) });
  const saved = saveShieldSettings(next, hooksPath);
  return {
    ok: true,
    settings: saved.settings,
    path: saved.path,
    hooks_path: saved.hooks_path,
    prompt_block_installed: saved.prompt_block_installed,
    requires_cursor_restart: saved.requires_cursor_restart,
    hooks_backup: saved.backup,
  };
}

export function buildShieldSettingsApiPayload(hooksPath = defaultHooksPath()) {
  const loaded = loadShieldSettings(hooksPath);
  const hooksState = detectShieldSettingsFromHooks(hooksPath);
  return {
    settings: loaded.settings,
    defs: SHIELD_SETTING_DEFS,
    path: loaded.path,
    exists: loaded.exists,
    hooks_path: loaded.hooks_path,
    hooks_exists: loaded.hooks_exists,
    hooks_in_sync:
      loaded.settings.prompt_block === hooksState.prompt_block &&
      loaded.settings.aggressive === hooksState.aggressive &&
      loaded.settings.fail_open === hooksState.fail_open,
    prompt_block_installed: hooksState.prompt_block,
    requires_cursor_restart: true,
    defaults: DEFAULT_SHIELD_SETTINGS,
  };
}
