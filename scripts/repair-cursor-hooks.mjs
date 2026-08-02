#!/usr/bin/env node
/**
 * Emergency repair for Cursor user hooks (all workspaces on a host).
 *
 * Fixes the common CastLine / multi-workspace failure:
 *   Tool blocked ... fail closed ... cursor-shield-prompt-hook.mjs
 *   Error: MainThreadShellExec not initialized
 *
 * Usage:
 *   npm run cursor:hooks:repair
 *   node scripts/repair-cursor-hooks.mjs
 *   # Windows host (no Node/WSL): scripts/repair-cursor-hooks.ps1
 *
 * What it does (primary + Windows Cursor when WSL or COSTGATE_WINDOWS_HOOKS_PATH):
 *   1. Re-merge CostGate hooks with quoted / cmd /c commands
 *   2. Strip failClosed from CostGate entries (default)
 *   3. Dedupe + order beforeSubmitPrompt
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  COSTGATE_HOOK_SCRIPTS,
  commandInvokesScript,
  installCursorRegistryHooksAll,
  loadHooks,
  resolveHooksInstallTargets,
} from "./install-cursor-registry-hook.mjs";

function countFailClosed(config) {
  let n = 0;
  for (const list of Object.values(config.hooks ?? {})) {
    for (const h of list ?? []) {
      if (
        h?.failClosed === true &&
        COSTGATE_HOOK_SCRIPTS.some((name) => commandInvokesScript(h.command, name))
      ) {
        n += 1;
      }
    }
  }
  return n;
}

function summarizePath(hooksPath) {
  if (!existsSync(hooksPath)) return { exists: false, failClosed: 0, shieldCmd: null };
  const config = loadHooks(hooksPath);
  const shield = (config.hooks?.beforeSubmitPrompt ?? []).find((h) =>
    commandInvokesScript(h.command, "cursor-shield-prompt-hook.mjs")
  );
  return {
    exists: true,
    failClosed: countFailClosed(config),
    shieldCmd: shield?.command ?? null,
    shieldFailClosed: shield?.failClosed === true,
  };
}

function main() {
  const targets = resolveHooksInstallTargets({});
  console.error("[cursor:hooks:repair] targets:");
  for (const t of targets) {
    const before = summarizePath(t.hooksPath);
    console.error(`  - ${t.hooksPath} (${t.platform})`);
    console.error(
      `    before: exists=${before.exists} costgateFailClosed=${before.failClosed}` +
        (before.shieldCmd ? ` shield=${JSON.stringify(before.shieldCmd)}` : " shield=(missing)")
    );
  }

  const { targets: results } = installCursorRegistryHooksAll({});

  console.error("[cursor:hooks:repair] after:");
  let remaining = 0;
  for (const r of results) {
    const after = summarizePath(r.hooksPath);
    remaining += after.failClosed;
    console.error(`  - ${r.hooksPath} (${r.platform})`);
    console.error(
      `    after: costgateFailClosed=${after.failClosed}` +
        (after.shieldCmd ? ` shield=${JSON.stringify(after.shieldCmd)}` : " shield=(missing)")
    );
    if (after.shieldFailClosed) {
      console.error("    WARNING: shield-prompt still has failClosed=true");
    }
  }

  console.error("");
  if (remaining > 0) {
    console.error(`[cursor:hooks:repair] FAILED: ${remaining} failClosed entries remain`);
    process.exit(1);
  }

  console.error("[cursor:hooks:repair] OK — CostGate failClosed cleared on all targets.");
  console.error("[cursor:hooks:repair] Fully quit Cursor (all windows), then reopen.");
  console.error(
    "[cursor:hooks:repair] CastLine / any workspace uses the same user hooks.json on that host."
  );
  console.error(
    "[cursor:hooks:repair] If error persists: Developer: Reload Window, or temporarily rename hooks.json."
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
