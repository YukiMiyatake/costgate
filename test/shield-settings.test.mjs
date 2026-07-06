#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyShieldSettingsToHooks,
  detectShieldSettingsFromHooks,
  patchShieldSettings,
} from "../scripts/lib/shield-settings.mjs";
import {
  findHookIndex,
  loadHooks,
  scriptBasename,
  SHIELD_PROMPT_SCRIPT,
} from "../scripts/lib/cursor-hooks.mjs";
import { mergeCostGateHooks } from "../scripts/install-cursor-registry-hook.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const dir = join(tmpdir(), `costgate-shield-settings-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function testNormalizeAndPatch() {
  const dir = tempDir();
  const settingsPath = join(dir, "shield-settings.json");
  const hooksPath = join(dir, "hooks.json");
  const prevSettings = process.env.COSTGATE_SHIELD_SETTINGS_PATH;
  const prevHooks = process.env.CURSOR_HOOKS_PATH;
  process.env.COSTGATE_SHIELD_SETTINGS_PATH = settingsPath;
  process.env.CURSOR_HOOKS_PATH = hooksPath;

  try {
    writeFileSync(hooksPath, `${JSON.stringify({ version: 1, hooks: {} }, null, 2)}\n`);

    const disabled = patchShieldSettings({ prompt_block: false }, hooksPath);
    assert(disabled.settings.prompt_block === false, "disable prompt_block");
    assert(disabled.prompt_block_installed === false, "hook removed");

    const enabled = patchShieldSettings(
      { prompt_block: true, aggressive: true, fail_open: false },
      hooksPath
    );
    assert(enabled.settings.aggressive === true, "aggressive saved");
    assert(enabled.prompt_block_installed === true, "hook installed");

    const hooks = loadHooks(hooksPath);
    const scriptName = scriptBasename(SHIELD_PROMPT_SCRIPT);
    const idx = findHookIndex(hooks.hooks.beforeSubmitPrompt ?? [], scriptName);
    assert(idx !== -1, "shield hook present");
    assert(hooks.hooks.beforeSubmitPrompt[idx].env.COSTGATE_SHIELD_PROMPT === "1", "prompt env");
    assert(
      hooks.hooks.beforeSubmitPrompt[idx].env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE === "1",
      "aggressive env"
    );

    console.error("[shield-settings] patch ok");
  } finally {
    if (prevSettings === undefined) delete process.env.COSTGATE_SHIELD_SETTINGS_PATH;
    else process.env.COSTGATE_SHIELD_SETTINGS_PATH = prevSettings;
    if (prevHooks === undefined) delete process.env.CURSOR_HOOKS_PATH;
    else process.env.CURSOR_HOOKS_PATH = prevHooks;
  }
}

function testMergeRespectsDisabled() {
  const dir = tempDir();
  const settingsPath = join(dir, "shield-settings.json");
  const hooksPath = join(dir, "hooks.json");
  writeFileSync(
    settingsPath,
    `${JSON.stringify({ version: 1, prompt_block: false, aggressive: false, fail_open: false }, null, 2)}\n`
  );
  writeFileSync(
    hooksPath,
    `${JSON.stringify(
      {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            {
              command: `node ${SHIELD_PROMPT_SCRIPT}`,
              env: { COSTGATE_SHIELD_PROMPT: "1" },
            },
          ],
        },
      },
      null,
      2
    )}\n`
  );

  const prevSettings = process.env.COSTGATE_SHIELD_SETTINGS_PATH;
  const prevHooks = process.env.CURSOR_HOOKS_PATH;
  process.env.COSTGATE_SHIELD_SETTINGS_PATH = settingsPath;
  process.env.CURSOR_HOOKS_PATH = hooksPath;

  try {
    const config = loadHooks(hooksPath);
    mergeCostGateHooks(config, { hooksPath });
    const scriptName = scriptBasename(SHIELD_PROMPT_SCRIPT);
    const idx = findHookIndex(config.hooks.beforeSubmitPrompt ?? [], scriptName);
    assert(idx === -1, "merge removes shield hook when disabled");
    console.error("[shield-settings] merge disabled ok");
  } finally {
    if (prevSettings === undefined) delete process.env.COSTGATE_SHIELD_SETTINGS_PATH;
    else process.env.COSTGATE_SHIELD_SETTINGS_PATH = prevSettings;
    if (prevHooks === undefined) delete process.env.CURSOR_HOOKS_PATH;
    else process.env.CURSOR_HOOKS_PATH = prevHooks;
  }
}

function testDetectFromHooks() {
  const dir = tempDir();
  const hooksPath = join(dir, "hooks.json");
  writeFileSync(
    hooksPath,
    `${JSON.stringify(
      {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            {
              command: `node ${SHIELD_PROMPT_SCRIPT}`,
              env: { COSTGATE_SHIELD_PROMPT: "1", COSTGATE_SHIELD_PROMPT_FAIL_OPEN: "1" },
            },
          ],
        },
      },
      null,
      2
    )}\n`
  );
  const prevHooks = process.env.CURSOR_HOOKS_PATH;
  process.env.CURSOR_HOOKS_PATH = hooksPath;
  try {
    const detected = detectShieldSettingsFromHooks(hooksPath);
    assert(detected.prompt_block === true, "detect enabled");
    assert(detected.fail_open === true, "detect fail_open");
    console.error("[shield-settings] detect ok");
  } finally {
    if (prevHooks === undefined) delete process.env.CURSOR_HOOKS_PATH;
    else process.env.CURSOR_HOOKS_PATH = prevHooks;
  }
}

async function main() {
  testNormalizeAndPatch();
  testMergeRespectsDisabled();
  testDetectFromHooks();
  console.error("[shield-settings] all passed");
}

main().catch((e) => {
  console.error("[shield-settings] fatal:", e);
  process.exit(1);
});
