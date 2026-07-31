#!/usr/bin/env node
/**
 * Phase 32c+: install-cursor-registry-hook merge / hooks.json output / Windows-WSL harden.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SHIELD_HOOK_ENV,
  SHIELD_MCP_SCRIPT,
  SHIELD_PROMPT_SCRIPT,
  SHIELD_READ_SCRIPT,
  buildHookDefs,
  commandInvokesScript,
  ensureHookEntry,
  findHookIndex,
  formatHookCommand,
  installCursorRegistryHooks,
  mergeCostGateHooks,
  orderBeforeSubmitPrompt,
  resolveHooksInstallTargets,
  scriptBasename,
  toHookScriptPath,
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
  return (hooks[key] ?? []).find((h) => commandInvokesScript(h.command, name));
}

function testFormatHookCommand() {
  const posix = formatHookCommand("/tmp/costgate/scripts/cursor-shield-prompt-hook.mjs", {
    platform: "linux",
  });
  assert(posix === 'node "/tmp/costgate/scripts/cursor-shield-prompt-hook.mjs"', `posix command: ${posix}`);

  const win = formatHookCommand("C:\\Users\\me\\costgate\\scripts\\cursor-shield-prompt-hook.mjs", {
    platform: "win32",
  });
  assert(
    win === 'cmd /c node "C:\\Users\\me\\costgate\\scripts\\cursor-shield-prompt-hook.mjs"',
    `win32 command: ${win}`
  );

  const msys = formatHookCommand("/e/Work/wsl/costgate/scripts/cursor-shield-prompt-hook.mjs", {
    platform: "win32",
  });
  assert(
    msys === 'cmd /c node "E:\\Work\\wsl\\costgate\\scripts\\cursor-shield-prompt-hook.mjs"',
    `msys→win32 command: ${msys}`
  );

  const wslMount = toHookScriptPath("/mnt/e/Work/wsl/costgate/scripts/cursor-shield-prompt-hook.mjs", {
    platform: "win32",
  });
  assert(
    wslMount === "E:\\Work\\wsl\\costgate\\scripts\\cursor-shield-prompt-hook.mjs",
    `/mnt/e → win32: ${wslMount}`
  );

  const etcKept = toHookScriptPath("/etc/costgate/cursor-shield-prompt-hook.mjs", { platform: "win32" });
  assert(etcKept.includes("etc"), `/etc must not become drive E: ${etcKept}`);

  console.error("[install-cursor-registry] formatHookCommand ok");
}

function testCommandInvokesScript() {
  assert(
    commandInvokesScript(
      'node "/tmp/x/cursor-shield-prompt-hook.mjs"',
      "cursor-shield-prompt-hook.mjs"
    ),
    "quoted path matches"
  );
  assert(
    commandInvokesScript(
      'cmd /c node "E:\\Work\\cursor-shield-prompt-hook.mjs"',
      "cursor-shield-prompt-hook.mjs"
    ),
    "win32 path matches"
  );
  assert(
    !commandInvokesScript(
      'echo "see cursor-shield-prompt-hook.mjs docs"',
      "cursor-shield-prompt-hook.mjs"
    ),
    "echo decoy must not match"
  );
  console.error("[install-cursor-registry] commandInvokesScript ok");
}

function testBuildHookDefs() {
  const defs = buildHookDefs({ platform: "linux", env: {} });
  const keys = defs.map((d) => d.key);
  assert(keys.includes("preToolUse"), "preToolUse defined");
  assert(keys.includes("beforeMCPExecution"), "beforeMCPExecution defined");
  assert(keys.filter((k) => k === "beforeSubmitPrompt").length === 2, "two beforeSubmitPrompt hooks");

  const promptDefs = defs.filter((d) => d.key === "beforeSubmitPrompt");
  const shieldPromptDef = promptDefs.find((d) => d.script.endsWith("cursor-shield-prompt-hook.mjs"));
  assert(shieldPromptDef, "shield prompt def");
  assert(shieldPromptDef.hook.failClosed === undefined, "prompt failClosed off by default");
  assert(shieldPromptDef.hook.env?.COSTGATE_SHIELD === "1", "prompt shield env");
  assert(shieldPromptDef.hook.env?.COSTGATE_SHIELD_PROMPT === "1", "prompt env flag");
  assert(
    shieldPromptDef.hook.command.includes('"') && shieldPromptDef.hook.command.startsWith("node "),
    "prompt command is quoted node invoke"
  );

  const readDef = defs.find((d) => d.key === "preToolUse");
  assert(readDef.hook.matcher === "Read", "Read matcher");
  assert(readDef.script.endsWith("cursor-shield-read-hook.mjs"), "read script path");
  assert(readDef.hook.env?.COSTGATE_SHIELD === "1", "read shield env");
  assert(readDef.hook.env?.COSTGATE_SHIELD_SESSION === "cursor", "read session env");

  const mcpDef = defs.find((d) => d.key === "beforeMCPExecution");
  assert(mcpDef.hook.failClosed === undefined, "mcp failClosed off by default");
  assert(mcpDef.hook.env?.COSTGATE_SHIELD === "1", "mcp shield env");
  assert(mcpDef.hook.env?.COSTGATE_SHIELD_SESSION === "cursor", "mcp session env");

  const winDefs = buildHookDefs({ platform: "win32", env: {} });
  assert(
    winDefs.every((d) => d.hook.command.startsWith("cmd /c node ")),
    "win32 hooks use cmd /c"
  );

  const closed = buildHookDefs({
    platform: "linux",
    env: { COSTGATE_HOOKS_FAIL_CLOSED: "1" },
  });
  const closedPrompt = closed.find((d) => d.script.endsWith("cursor-shield-prompt-hook.mjs"));
  assert(closedPrompt.hook.failClosed === true, "opt-in failClosed");

  console.error("[install-cursor-registry] buildHookDefs ok");
}

function testMergeFreshConfig() {
  const { config, installed } = mergeCostGateHooks({ version: 1, hooks: {} });
  assert(installed.length >= buildHookDefs({ env: {} }).length, "all hooks installed on fresh config");

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
  assert(
    second.installed.filter((k) => !String(k).startsWith("ordered:")).length === 0,
    "second merge is idempotent"
  );
  console.error("[install-cursor-registry] idempotent merge ok");
}

function testUpgradeStripsFailClosedAndDecoy() {
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
      beforeSubmitPrompt: [
        {
          command: 'echo "see cursor-shield-prompt-hook.mjs docs"',
          timeout: 1,
        },
        {
          command: `node ${SHIELD_PROMPT_SCRIPT}`,
          timeout: 5,
          failClosed: true,
          matcher: "STALE",
        },
      ],
    },
  };
  const { config: merged } = mergeCostGateHooks(config);
  const mcpHook = findHook(merged.hooks, "beforeMCPExecution", SHIELD_MCP_SCRIPT);
  assert(mcpHook.failClosed === undefined, "stale mcp failClosed stripped");
  assert(mcpHook.command.includes('"'), "command upgraded to quoted path");

  const promptList = merged.hooks.beforeSubmitPrompt;
  assert(
    promptList.some((h) => h.command.includes("echo")),
    "foreign echo decoy preserved"
  );
  const promptHook = findHook(merged.hooks, "beforeSubmitPrompt", SHIELD_PROMPT_SCRIPT);
  assert(promptHook, "real shield prompt kept");
  assert(promptHook.failClosed === undefined, "stale prompt failClosed stripped");
  assert(promptHook.matcher === undefined, "stale matcher cleared by full replace");

  const intentIdx = findHookIndex(promptList, "cursor-prompt-intent-hook.mjs");
  const shieldIdx = findHookIndex(promptList, "cursor-shield-prompt-hook.mjs");
  assert(intentIdx !== -1 && shieldIdx !== -1 && intentIdx < shieldIdx, "intent before shield");

  console.error("[install-cursor-registry] upgrade + decoy ok");
}

function testEnsureHookEntryFullReplace() {
  const list = [
    {
      command: "node /tmp/cursor-shield-read-hook.mjs",
      timeout: 5,
      matcher: "STALE",
      env: { OLD_KEY: "1", COSTGATE_SHIELD: "0" },
    },
  ];
  const changed = ensureHookEntry(list, "cursor-shield-read-hook.mjs", {
    command: 'node "/tmp/cursor-shield-read-hook.mjs"',
    timeout: 15,
    matcher: "Read",
    env: { ...SHIELD_HOOK_ENV },
  });
  assert(changed, "replace reports change");
  assert(list.length === 1, "no duplicate");
  assert(list[0].matcher === "Read", "matcher replaced");
  assert(list[0].timeout === 15, "timeout replaced");
  assert(list[0].env?.COSTGATE_SHIELD === "1", "env replaced");
  assert(list[0].env?.OLD_KEY === undefined, "stale env key cleared");
  console.error("[install-cursor-registry] ensureHookEntry full replace ok");
}

function testDedupeSameScript() {
  const list = [
    { command: 'node "/a/cursor-shield-mcp-hook.mjs"', failClosed: true },
    { command: 'node "/b/cursor-shield-mcp-hook.mjs"', failClosed: true },
  ];
  ensureHookEntry(list, "cursor-shield-mcp-hook.mjs", {
    command: 'node "/c/cursor-shield-mcp-hook.mjs"',
    timeout: 5,
    env: { ...SHIELD_HOOK_ENV },
  });
  assert(list.length === 1, "duplicates removed");
  assert(list[0].failClosed === undefined, "failClosed gone");
  console.error("[install-cursor-registry] dedupe ok");
}

function testOrderBeforeSubmitPrompt() {
  const list = [
    { command: 'node "/x/cursor-shield-prompt-hook.mjs"' },
    { command: "echo foreign" },
    { command: 'node "/x/cursor-prompt-intent-hook.mjs"' },
  ];
  assert(orderBeforeSubmitPrompt(list), "reordered");
  assert(list[0].command.includes("prompt-intent"), "intent first");
  assert(list[1].command.includes("shield-prompt"), "shield second");
  assert(list[2].command === "echo foreign", "foreign last");
  console.error("[install-cursor-registry] order ok");
}

function testResolveTargetsWslWindows() {
  const targets = resolveHooksInstallTargets({
    hooksPath: "/home/u/.cursor/hooks.json",
    platform: "linux",
    env: {
      WSL_DISTRO_NAME: "Ubuntu",
      COSTGATE_WINDOWS_HOOKS_PATH: "/mnt/c/Users/u/.cursor/hooks.json",
    },
  });
  assert(targets.length === 2, "WSL installs linux + windows targets");
  assert(targets[1].platform === "win32", "windows target is win32");

  const disabled = resolveHooksInstallTargets({
    hooksPath: "/home/u/.cursor/hooks.json",
    platform: "linux",
    env: {
      WSL_DISTRO_NAME: "Ubuntu",
      COSTGATE_HOOKS_WINDOWS: "0",
      COSTGATE_WINDOWS_HOOKS_PATH: "/mnt/c/Users/u/.cursor/hooks.json",
    },
  });
  assert(disabled.length === 1, "COSTGATE_HOOKS_WINDOWS=0 skips windows");
  console.error("[install-cursor-registry] resolve targets ok");
}

function testInstallWritesFile() {
  const { base, hooksPath } = tempHooksPath();
  try {
    const { installed, config } = installCursorRegistryHooks(hooksPath, { env: {} });
    assert(installed.length > 0, "installed hooks");
    const onDisk = JSON.parse(readFileSync(hooksPath, "utf8"));
    assert(onDisk.hooks.preToolUse?.length === 1, "preToolUse on disk");
    const readHook = findHook(onDisk.hooks, "preToolUse", SHIELD_READ_SCRIPT);
    assert(readHook?.matcher === "Read", "Read matcher on disk");
    assert(readHook?.env?.COSTGATE_SHIELD === "1", "shield on disk");
    assert(config.hooks.beforeSubmitPrompt?.length === 2, "prompt-intent + shield-prompt");
    const shieldPromptHook = findHook(onDisk.hooks, "beforeSubmitPrompt", SHIELD_PROMPT_SCRIPT);
    assert(shieldPromptHook?.failClosed === undefined, "shield prompt failClosed absent on disk");
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
    installCursorRegistryHooks(hooksPath, { env: {} });
    const onDisk = JSON.parse(readFileSync(hooksPath, "utf8"));
    assert(onDisk.hooks.beforeShellExecution?.[0]?.command === "echo foreign", "foreign hook kept");
    assert(findHook(onDisk.hooks, "preToolUse", SHIELD_READ_SCRIPT), "shield read added");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  console.error("[install-cursor-registry] preserves foreign hooks ok");
}

function main() {
  testFormatHookCommand();
  testCommandInvokesScript();
  testBuildHookDefs();
  testMergeFreshConfig();
  testMergeIdempotent();
  testUpgradeStripsFailClosedAndDecoy();
  testEnsureHookEntryFullReplace();
  testDedupeSameScript();
  testOrderBeforeSubmitPrompt();
  testResolveTargetsWslWindows();
  testInstallWritesFile();
  testPreservesForeignHooks();
  console.error("[install-cursor-registry] all passed");
}

main();
