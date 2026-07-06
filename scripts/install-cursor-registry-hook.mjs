#!/usr/bin/env node
/**
 * Merge CostGate Cursor hooks into ~/.cursor/hooks.json
 *  · workspace registry (workspaceOpen / Read / Tab)
 *  · prompt intent (beforeSubmitPrompt)
 *  · shield prompt secret block (beforeSubmitPrompt) — respects shield-settings.json
 *  · shield MCP trust (beforeMCPExecution)
 *  · shield Read sanitizer (preToolUse / Read)
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
  loadHooks,
  removeHookEntry,
  scriptBasename,
  writeHooks,
} from "./lib/cursor-hooks.mjs";
import { loadShieldSettings, DEFAULT_SHIELD_SETTINGS, applyShieldSettingsToHooks } from "./lib/shield-settings.mjs";

export {
  DEFAULT_HOOKS_PATH,
  PROMPT_SCRIPT,
  REGISTRY_SCRIPT,
  SHIELD_HOOK_ENV,
  SHIELD_MCP_SCRIPT,
  SHIELD_PROMPT_SCRIPT,
  SHIELD_READ_SCRIPT,
  buildHookDefs,
  ensureHookEntry,
  findHookIndex,
  loadHooks,
  removeHookEntry,
  scriptBasename,
} from "./lib/cursor-hooks.mjs";

/** Merge CostGate hook definitions into an existing hooks.json config. */
export function mergeCostGateHooks(config, options = {}) {
  const loaded = loadShieldSettings(options.hooksPath);
  const shieldSettings =
    options.shieldSettings ?? (loaded.exists ? loaded.settings : DEFAULT_SHIELD_SETTINGS);
  const installed = [];
  for (const { key, script, hook } of buildHookDefs()) {
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
  return { config, installed };
}

export function installCursorRegistryHooks(hooksPath = defaultHooksPath()) {
  const config = loadHooks(hooksPath);
  const { config: merged, installed } = mergeCostGateHooks(config, { hooksPath });
  writeHooks(merged, hooksPath);
  const loaded = loadShieldSettings(hooksPath);
  const shield = loaded.exists ? loaded.settings : DEFAULT_SHIELD_SETTINGS;
  applyShieldSettingsToHooks(shield, hooksPath);
  return { hooksPath, installed, config: loadHooks(hooksPath) };
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
