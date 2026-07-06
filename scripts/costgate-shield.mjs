#!/usr/bin/env node
/**
 * CostGate Shield CLI — Phase 33b
 *
 * Usage:
 *   node scripts/costgate-shield.mjs sanitize-prompt "text with ghp_xxx"
 *   echo "secret prompt" | node scripts/costgate-shield.mjs sanitize-prompt
 *   node scripts/costgate-shield.mjs sanitize-prompt --json --aggressive < prompt.txt
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { sanitizePromptText } from "./lib/shield-prompt.mjs";
import { Mode } from "./lib/shield-redact.mjs";

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function parseArgs(argv) {
  const flags = { json: false, aggressive: false, text: "" };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--aggressive") flags.aggressive = true;
    else if (arg === "--text") flags.text = argv[++i] ?? "";
    else if (arg === "--file") {
      const path = argv[++i];
      flags.text = readFileSync(path, "utf8");
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printHelp() {
  process.stderr.write(`CostGate Shield CLI

Usage:
  costgate-shield sanitize-prompt [text]
  echo "prompt" | costgate-shield sanitize-prompt

Options:
  --text <str>     Prompt text inline
  --file <path>    Read prompt from file
  --aggressive     Also redact email/phone/path/env (Mode.Aggressive)
  --json           Output JSON { sanitized, findings, mode }
  -h, --help       Show help
`);
}

async function cmdSanitizePrompt(argv) {
  const { flags, positional } = parseArgs(argv);
  if (flags.help) {
    printHelp();
    return 0;
  }

  let text = flags.text || positional.join(" ");
  if (!text && !process.stdin.isTTY) {
    text = (await readStdin()).trim();
  }
  if (!text.trim()) {
    process.stderr.write("error: prompt text required (arg, --text, --file, or stdin)\n");
    return 1;
  }

  const mode = flags.aggressive ? Mode.Aggressive : undefined;
  const result = sanitizePromptText(text, { mode });
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.sanitized}\n`);
    if (result.findings.length) {
      const kinds = [...new Set(result.findings.map((f) => f.kind))].join(", ");
      process.stderr.write(`[shield] redacted: ${kinds}\n`);
    }
  }
  return 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    return cmd ? 0 : 1;
  }
  if (cmd === "sanitize-prompt") {
    return cmdSanitizePrompt(rest);
  }
  process.stderr.write(`error: unknown command "${cmd}"\n`);
  printHelp();
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((e) => {
      process.stderr.write(`[costgate-shield] ${e.message ?? e}\n`);
      process.exit(1);
    });
}

export { cmdSanitizePrompt, parseArgs };
