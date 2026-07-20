#!/usr/bin/env node
/**
 * Install Dashboard Node deps into ~/.costgate/node_modules (Linux-native FS).
 *
 * Needed when the repo lives on a Windows/DrvFs mount (e.g. /mnt/c, /e/...) where
 * npm extracts truncated packages and @modelcontextprotocol/sdk fails to load.
 *
 * Usage: npm run cursor:deps
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  costgateNodeModulesDir,
  sdkClientEntryPath,
  sdkLoads,
} from "./lib/mcp-sdk-resolve.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NM = costgateNodeModulesDir();
const TARGET = join(NM, "..");
const SDK_ENTRY = sdkClientEntryPath(NM);

function readProbeSdkRange() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "packages", "probe", "package.json"), "utf8")
    );
    return pkg.dependencies?.["@modelcontextprotocol/sdk"] ?? "^1.12.1";
  } catch {
    return "^1.12.1";
  }
}

function main() {
  mkdirSync(TARGET, { recursive: true });
  if (sdkLoads()) {
    console.error(`[cursor:deps] ok ${NM} (sdk already loadable)`);
    process.exit(0);
  }

  const range = readProbeSdkRange();
  console.error(`[cursor:deps] installing @modelcontextprotocol/sdk@${range} → ${NM}`);
  const r = spawnSync(
    "npm",
    ["install", `@modelcontextprotocol/sdk@${range}`, "--omit=dev", "--no-package-lock"],
    {
      cwd: TARGET,
      stdio: "inherit",
      env: process.env,
    }
  );
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
  if (!sdkLoads()) {
    console.error(
      `[cursor:deps] sdk still unreadable at ${SDK_ENTRY}. Use a Linux-native path for ~/.costgate.`
    );
    process.exit(1);
  }
  console.error(`[cursor:deps] ready — Dashboard will load SDK from ${NM}`);
}

main();
