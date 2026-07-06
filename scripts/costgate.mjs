#!/usr/bin/env node
/**
 * CostGate CLI entry — routes subcommands.
 *   costgate shield sanitize-prompt [text]
 */
import { pathToFileURL } from "node:url";
import { cmdSanitizePrompt, parseArgs } from "./costgate-shield.mjs";

function printHelp() {
  process.stderr.write(`CostGate CLI

Usage:
  costgate shield sanitize-prompt [text]
  echo "prompt" | costgate shield sanitize-prompt

Run "node scripts/costgate-shield.mjs --help" for sanitize options.
`);
}

async function main() {
  const [group, cmd, ...rest] = process.argv.slice(2);
  if (!group || group === "--help" || group === "-h") {
    printHelp();
    process.exit(group ? 0 : 1);
  }
  if (group === "shield" && cmd === "sanitize-prompt") {
    const code = await cmdSanitizePrompt(rest);
    process.exit(code ?? 0);
  }
  process.stderr.write(`error: unknown command "${group} ${cmd ?? ""}".\n`);
  printHelp();
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[costgate] ${e.message ?? e}\n`);
    process.exit(1);
  });
}
