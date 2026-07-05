#!/usr/bin/env node
/**
 * Phase 32c: install-cursor-registry-hook merge / hooks.json output.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SHIELD_HOOK_ENV,
  SHIELD_MCP_SCRIPT,
  SHIELD_READ_SCRIPT,
  buildHookDefs,
  ensureHookEntry,
  installCursorRegistryHooks,
  mergeCostGateHooks,
  scriptBasename,
} from "../scripts/install-cursor-registry-hook.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempHooksPath() {
  const base = mkdtempSync(join(tmpdir(), `costgate-hooks-install-${process.pid}-`));
  return { base, hooksPath: join(base, "hooks.json") };
}

function findHook(hooks, key, scriptPath) {
  const name = scriptBasename(scriptPath);
  return (hooks[key] ?? []).find((h) => String(h.command ?? "").includes(name));
}

function testBuildHookDefs() {
  const defs = buildHookDefs();
  const keys = defs.map((d) => d.key);
  assert(keys.includes("preToolUse"), "preToolUse defined");
  assert(keys.includes("beforeMCPExecution"), "beforeMCPExecution defined");

  const readDef = defs.find((d) => d.key === "preToolUse");
  assert(readDef.hook.matcher === "Read", "Read matcher");
  assert(readDef.script.endsWith("cursor-shield-read-hook.mjs"), "read script path");
  assert(readDef.hook.env?.COSTGATE_SHIELD === "1", "read shield env");
  assert(readDef.hook.env?.COSTGATE_SHIELD_SESSION === "cursor", "read session env");

  const mcpDef = defs.find((d) => d.key === "beforeMCPExecution");
  assert(mcpDef.hook.failClosed === true, "mcp failClosed");
  assert(mcpDef.hook.env?.COSTGATE_SHIELD === "1", "mcp shield env");
  assert(mcpDef.hook.env?.COSTGATE_SHIELD_SESSION === "cursor", "mcp session env");

  console.error("[install-cursor-registry] buildHookDefs ok");
}

function testMergeFreshConfig() {
  const { config, installed } = mergeCostGateHooks({ version: 1, hooks: {} });
  assert(installed.length === buildHookDefs().length, "all hooks installed on fresh config");

  const readHook = findHook(config.hooks, "preToolUse", SHIELD_READ_SCRIPT);
  assert(readHook, "preToolUse Read hook present");
  assert(readHook.matcher === "Read", "matcher Read");
  assert(readHook.env?.COSTGATE_SHIELD === "1", "shield enabled");
  assert(readHook.env?.COSTGATE_SHIELD_SESSION === SHIELD_HOOK_ENV.COSTGATE_SHIELD_SESSION, "session env");

  const mcpHook = findHook(config.hooks, "beforeMCPExecution", SHIELD_MCP_SCRIPT);
  assert(mcpHook?.env?.COSTGATE_SHIELD === "1", "mcp shield env on fresh merge");

  console.error("[install-cursor-registry] fresh merge ok");
}

function testMergeIdempotent() {
  const base = { version: 1, hooks: {} };
  const first = mergeCostGateHooks(structuredClone(base));
  const second = mergeCostGateHooks(structuredClone(first.config));
  assert(second.installed.length === 0, "second merge is idempotent");
  console.error("[install-cursor-registry] idempotent merge ok");
}

function testUpgradeExistingShieldMcp() {
  const mcpName = scriptBasename(SHIELD_MCP_SCRIPT);
  const config = {
    version: 1,
    hooks: {
      beforeMCPExecution: [
        {
          command: `node ${SHIELD_MCP_SCRIPT}`,
          timeout: 5,
          failClosed: true,
        },
      ],
    },
  };
  const { config: merged, installed } = mergeCostGateHooks(config);
  assert(installed.includes("beforeMCPExecution"), "upgraded mcp hook");
  const mcpHook = findHook(merged.hooks, "beforeMCPExecution", SHIELD_MCP_SCRIPT);
  assert(mcpHook.env?.COSTGATE_SHIELD === "1", "env added to existing mcp hook");
  assert(mcpHook.env?.COSTGATE_SHIELD_SESSION === "cursor", "session added");
  console.error("[install-cursor-registry] upgrade shield-mcp ok");
}

function testEnsureHookEntryMergeEnv() {
  const list = [{ command: "node /tmp/cursor-shield-read-hook.mjs", timeout: 5 }];
  const changed = ensureHookEntry(list, "cursor-shield-read-hook.mjs", {
    command: "node /tmp/cursor-shield-read-hook.mjs",
    timeout: 15,
    matcher: "Read",
    env: { ...SHIELD_HOOK_ENV },
  });
  assert(changed, "env merge reports change");
  assert(list[0].matcher === "Read", "matcher merged");
  assert(list[0].timeout === 15, "timeout merged");
  assert(list[0].env?.COSTGATE_SHIELD === "1", "env merged");
  console.error("[install-cursor-registry] ensureHookEntry ok");
}

function testInstallWritesFile() {
  const { base, hooksPath } = tempHooksPath();
  try {
    const { installed, config } = installCursorRegistryHooks(hooksPath);
    assert(installed.length > 0, "installed hooks");
    const onDisk = JSON.parse(readFileSync(hooksPath, "utf8"));
    assert(onDisk.hooks.preToolUse?.length === 1, "preToolUse on disk");
    const readHook = findHook(onDisk.hooks, "preToolUse", SHIELD_READ_SCRIPT);
    assert(readHook?.matcher === "Read", "Read matcher on disk");
    assert(readHook?.env?.COSTGATE_SHIELD === "1", "shield on disk");
    assert(config.hooks.beforeSubmitPrompt?.length === 1, "prompt-intent preserved in return");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  console.error("[install-cursor-registry] install writes file ok");
}

function testPreservesForeignHooks() {
  const { base, hooksPath } = tempHooksPath();
  writeFileSync(
    hooksPath,
    `${JSON.stringify(
      {
        version: 1,
        hooks: {
          beforeShellExecution: [{ command: "echo foreign", timeout: 1 }],
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  try {
    installCursorRegistryHooks(hooksPath);
    const onDisk = JSON.parse(readFileSync(hooksPath, "utf8"));
    assert(onDisk.hooks.beforeShellExecution?.[0]?.command === "echo foreign", "foreign hook kept");
    assert(findHook(onDisk.hooks, "preToolUse", SHIELD_READ_SCRIPT), "shield read added");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  console.error("[install-cursor-registry] preserves foreign hooks ok");
}

function main() {
  testBuildHookDefs();
  testMergeFreshConfig();
  testMergeIdempotent();
  testUpgradeExistingShieldMcp();
  testEnsureHookEntryMergeEnv();
  testInstallWritesFile();
  testPreservesForeignHooks();
  console.error("[install-cursor-registry] all passed");
}

main();
