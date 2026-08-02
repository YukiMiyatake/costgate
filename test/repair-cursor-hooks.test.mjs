#!/usr/bin/env node
/**
 * repair-cursor-hooks strips failClosed and rewrites commands.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  const base = mkdtempSync(join(tmpdir(), `costgate-hooks-repair-${process.pid}-`));
  const hooksPath = join(base, "hooks.json");
  writeFileSync(
    hooksPath,
    `${JSON.stringify(
      {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            {
              command: "node /e/Work/wsl/costgate/scripts/cursor-shield-prompt-hook.mjs",
              timeout: 5,
              failClosed: true,
              env: { COSTGATE_SHIELD: "1", COSTGATE_SHIELD_PROMPT: "1" },
            },
          ],
        },
      },
      null,
      2
    )}\n`
  );

  const env = {
    ...process.env,
    CURSOR_HOOKS_PATH: hooksPath,
    COSTGATE_HOOKS_WINDOWS: "0",
    COSTGATE_HOOKS_FAIL_CLOSED: "0",
  };
  delete env.COSTGATE_HOOKS_FAIL_CLOSED;

  const r = spawnSync(process.execPath, [join(ROOT, "scripts/repair-cursor-hooks.mjs")], {
    env,
    encoding: "utf8",
  });
  assert(r.status === 0, `repair exit ${r.status}: ${r.stderr}`);

  const onDisk = JSON.parse(readFileSync(hooksPath, "utf8"));
  const shield = (onDisk.hooks.beforeSubmitPrompt ?? []).find((h) =>
    String(h.command).includes("cursor-shield-prompt-hook.mjs")
  );
  assert(shield, "shield present");
  assert(shield.failClosed === undefined, "failClosed stripped");
  assert(shield.command.includes('"'), "command quoted");
  assert(!shield.command.includes("/e/Work"), "MSYS path rewritten when platform allows");

  rmSync(base, { recursive: true, force: true });
  console.error("[repair-cursor-hooks] ok");
}

main();
