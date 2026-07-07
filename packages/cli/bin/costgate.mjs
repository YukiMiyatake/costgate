#!/usr/bin/env node
/**
 * @costgate/cli — Gate launcher, Dashboard, Cursor setup.
 *
 *   costgate init          Install Gate binary + mcp.json + hooks
 *   costgate gate          MCP entry (Dashboard + costgate-gate)
 *   costgate dashboard     Manual Dashboard
 *   costgate registry      Cursor hooks only
 *   costgate update        Re-fetch Gate + refresh mcp.json + hooks
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { runInit } from "../src/init.mjs";
import { runGate } from "../src/gate.mjs";
import { runDashboard } from "../src/dashboard.mjs";
import { installRegistryHooks } from "../src/registry.mjs";
import { ensureGateBinaryForCli } from "../src/install-gate.mjs";
import { readCliPackageVersion } from "../src/cli-runtime.mjs";
import {
  applyProductionMcp,
  DEFAULT_MCP_PATH,
  loadMcpJson,
  saveMcpJson,
} from "../src/mcp-config.mjs";

function printHelp() {
  process.stderr.write(`@costgate/cli — Gate your MCP. Cut your bill.

Usage:
  costgate init [--no-hooks] [--force-gate]
  costgate gate
  costgate dashboard
  costgate registry
  costgate update
  costgate shield sanitize-prompt [text]

Quick start:
  npx @costgate/cli@latest init
  # Restart Cursor MCP

Docs: https://github.com/YukiMiyatake/costgate
`);
}

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (const a of argv) {
    if (a === "--no-hooks") flags.noHooks = true;
    else if (a === "--force-gate") flags.forceGate = true;
    else rest.push(a);
  }
  return { flags, rest };
}

async function runShieldSanitize(rest) {
  const { cliRuntimeRoot } = await import("../src/cli-runtime.mjs");
  const runtimeRoot = cliRuntimeRoot();
  const mod = await import(
    pathToFileURL(join(runtimeRoot, "scripts/costgate-shield.mjs")).href
  );
  const code = await mod.cmdSanitizePrompt(rest);
  process.exit(code ?? 0);
}

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const { flags, rest: args } = parseFlags(rest);

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  try {
    switch (cmd) {
      case "init": {
        const result = await runInit({
          hooks: !flags.noHooks,
          forceGate: flags.forceGate,
        });
        for (const line of result.steps) {
          process.stderr.write(`[costgate] ${line}\n`);
        }
        process.stderr.write("[costgate] Restart Cursor MCP or reload the window.\n");
        break;
      }
      case "gate": {
        const code = await runGate();
        process.exit(code);
      }
      case "dashboard": {
        const code = await runDashboard();
        process.exit(code);
      }
      case "registry": {
        const { hooksPath, installed } = await installRegistryHooks();
        process.stderr.write(`[costgate] hooks → ${hooksPath}\n`);
        process.stderr.write(
          `[costgate] added: ${installed.length ? installed.join(", ") : "(already present)"}\n`
        );
        process.stderr.write("[costgate] Restart Cursor after install.\n");
        break;
      }
      case "update": {
        const ver = readCliPackageVersion();
        const gate = await ensureGateBinaryForCli({ version: ver, force: true });
        process.stderr.write(`[costgate] Gate ${gate.path} (${gate.tag ?? ver})\n`);
        const mcpPath = DEFAULT_MCP_PATH;
        const mcp = applyProductionMcp(loadMcpJson(mcpPath), ver);
        saveMcpJson(mcp, mcpPath);
        process.stderr.write(`[costgate] mcp.json → @costgate/cli@${ver}\n`);
        const { hooksPath, installed } = await installRegistryHooks();
        process.stderr.write(`[costgate] hooks → ${hooksPath} (+${installed.length})\n`);
        process.stderr.write("[costgate] Restart Cursor MCP or reload the window.\n");
        break;
      }
      case "shield":
        if (sub === "sanitize-prompt") {
          await runShieldSanitize(args);
          return;
        }
        throw new Error(`unknown shield command: ${sub ?? ""}`);
      default:
        throw new Error(`unknown command: ${cmd}`);
    }
  } catch (err) {
    process.stderr.write(`[costgate] ${err.message ?? err}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
