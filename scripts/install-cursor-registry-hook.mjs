#!/usr/bin/env node
/**
 * Merge CostGate Cursor hooks into ~/.cursor/hooks.json
 *  · workspace registry (workspaceOpen / Read / Tab)
 *  · prompt intent (beforeSubmitPrompt)
 *  · shield prompt secret block (beforeSubmitPrompt) — respects shield-settings.json
 *  · shield MCP trust (beforeMCPExecution)
 *  · shield Read sanitizer (preToolUse / Read)
 *
 * In WSL, also updates Windows Cursor's hooks.json when detectable
 * (user hooks apply to all workspaces on that host).
 */
import { pathToFileURL } from "node:url";
import {
  DEFAULT_HOOKS_PATH,
  PROMPT_SCRIPT,
  REGISTRY_SCRIPT,
  SHIELD_MCP_SCRIPT,
  SHIELD_PROMPT_SCRIPT,
  SHIELD_READ_SCRIPT,
  buildHookDefs,
  defaultHooksPath,
  ensureHookEntry,
  finalizeCostGateHooks,
  hooksFailClosed,
  loadHooks,
  removeHookEntry,
  resolveHooksInstallTargets,
  scriptBasename,
  writeHooks,
} from "./lib/cursor-hooks.mjs";
import { loadShieldSettings, DEFAULT_SHIELD_SETTINGS, applyShieldSettingsToHooks } from "./lib/shield-settings.mjs";

export {
  COSTGATE_HOOK_SCRIPTS,
  DEFAULT_HOOKS_PATH,
  PROMPT_SCRIPT,
  REGISTRY_SCRIPT,
  SHIELD_HOOK_ENV,
  SHIELD_MCP_SCRIPT,
  SHIELD_PROMPT_SCRIPT,
  SHIELD_READ_SCRIPT,
  buildHookDefs,
  commandInvokesScript,
  ensureHookEntry,
  findHookIndex,
  formatHookCommand,
  hooksFailClosed,
  loadHooks,
  orderBeforeSubmitPrompt,
  removeHookEntry,
  resolveHooksInstallTargets,
  scriptBasename,
  toHookScriptPath,
} from "./lib/cursor-hooks.mjs";

/** Merge CostGate hook definitions into an existing hooks.json config. */
export function mergeCostGateHooks(config, options = {}) {
  const loaded = loadShieldSettings(options.hooksPath);
  const shieldSettings =
    options.shieldSettings ?? (loaded.exists ? loaded.settings : DEFAULT_SHIELD_SETTINGS);
  const defs = buildHookDefs({
    platform: options.platform,
    env: options.env,
    failClosed: options.failClosed,
  });
  const installed = [];
  config.hooks ??= {};

  for (const { key, script, hook } of defs) {
    const scriptName = scriptBasename(script);
    config.hooks[key] ??= [];

    if (script === SHIELD_PROMPT_SCRIPT && !shieldSettings.prompt_block) {
      if (removeHookEntry(config.hooks[key], scriptName)) {
        installed.push(`${key}:removed-shield-prompt`);
      }
      continue;
    }

    if (ensureHookEntry(config.hooks[key], scriptName, hook)) {
      installed.push(key);
    }
  }

  if (finalizeCostGateHooks(config)) {
    installed.push("ordered:beforeSubmitPrompt");
  }

  return { config, installed };
}

/** Install/merge CostGate hooks into a single hooks.json path. */
export function installCursorRegistryHooks(hooksPath = defaultHooksPath(), options = {}) {
  const platform = options.platform ?? (options.env?.COSTGATE_HOOKS_PLATFORM || undefined);
  const config = loadHooks(hooksPath);
  const { config: merged, installed } = mergeCostGateHooks(config, {
    hooksPath,
    platform,
    env: options.env,
    shieldSettings: options.shieldSettings,
    failClosed: options.failClosed,
  });
  writeHooks(merged, hooksPath);
  const loaded = loadShieldSettings(hooksPath);
  const shield = options.shieldSettings ?? (loaded.exists ? loaded.settings : DEFAULT_SHIELD_SETTINGS);
  applyShieldSettingsToHooks(shield, hooksPath, {
    platform,
    env: options.env,
  });
  return { hooksPath, installed, platform: platform ?? process.platform, config: loadHooks(hooksPath) };
}

/**
 * Install into primary hooks path, and on WSL also into Windows Cursor's hooks.json.
 * Returns { targets: [...], primary }.
 */
export function installCursorRegistryHooksAll(options = {}) {
  const targets = resolveHooksInstallTargets(options);
  const results = [];
  for (const t of targets) {
    results.push(
      installCursorRegistryHooks(t.hooksPath, {
        ...options,
        platform: t.platform,
      })
    );
  }
  return {
    targets: results,
    hooksPath: results[0]?.hooksPath,
    installed: results[0]?.installed ?? [],
    config: results[0]?.config,
  };
}

function main() {
  const { targets } = installCursorRegistryHooksAll();
  for (const r of targets) {
    console.error(`[cursor:hooks] → ${r.hooksPath} (${r.platform})`);
    console.error(
      `[cursor:hooks] changed: ${r.installed.length ? r.installed.join(", ") : "(already present)"}`
    );
  }
  console.error(`[cursor:hooks] registry: ${REGISTRY_SCRIPT}`);
  console.error(`[cursor:hooks] prompt-intent: ${PROMPT_SCRIPT}`);
  console.error(`[cursor:hooks] shield-prompt: ${SHIELD_PROMPT_SCRIPT}`);
  console.error(`[cursor:hooks] shield-mcp: ${SHIELD_MCP_SCRIPT}`);
  console.error(`[cursor:hooks] shield-read: ${SHIELD_READ_SCRIPT}`);
  console.error(
    `[cursor:hooks] failClosed: ${hooksFailClosed() ? "on (COSTGATE_HOOKS_FAIL_CLOSED)" : "off (default; avoids MainThreadShellExec lockouts)"}`
  );
  console.error("[cursor:hooks] Restart Cursor after install (user hooks apply to all workspaces).");
  console.error(
    "[cursor:hooks] Transcript tail (opt-in): COSTGATE_PROMPT_INTENT_TRANSCRIPT=1 on the hook process."
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
