/**
 * Resolve @modelcontextprotocol/sdk when repo node_modules is corrupt (WSL DrvFs).
 * Prefers ~/.costgate/node_modules (Linux-native) over workspace node_modules.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const SDK_PKG = "@modelcontextprotocol/sdk";

export function costgateNodeModulesDir() {
  return join(homedir(), ".costgate", "node_modules");
}

export function sdkClientEntryPath(nodeModulesDir) {
  return join(nodeModulesDir, SDK_PKG, "dist", "esm", "client", "index.js");
}

/** True when the SDK ESM entry looks intact (not a DrvFs-truncated file). */
export function isSdkEntryValid(entryPath) {
  if (!existsSync(entryPath)) return false;
  try {
    const head = readFileSync(entryPath, "utf8").slice(0, 40);
    return head.includes("import ");
  } catch {
    return false;
  }
}

function workspaceSdkRoot() {
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve(`${SDK_PKG}/package.json`);
    return dirname(pkgJson);
  } catch {
    return null;
  }
}

/** @returns {string | null} absolute path to @modelcontextprotocol/sdk package root */
export function resolveSdkRoot() {
  const homeNm = costgateNodeModulesDir();
  const homeEntry = sdkClientEntryPath(homeNm);
  if (isSdkEntryValid(homeEntry)) {
    return join(homeNm, SDK_PKG);
  }

  const wsRoot = workspaceSdkRoot();
  if (wsRoot) {
    const entry = join(wsRoot, "dist", "esm", "client", "index.js");
    if (isSdkEntryValid(entry)) return wsRoot;
  }

  return null;
}

export function sdkLoads() {
  return resolveSdkRoot() != null;
}

async function importSdkSubpath(subpath) {
  const root = resolveSdkRoot();
  if (!root) {
    throw new Error(
      "Cannot load @modelcontextprotocol/sdk. Run: npm run cursor:deps (or npm install in the repo on a Linux-native path)"
    );
  }
  return import(pathToFileURL(join(root, "dist", "esm", subpath)).href);
}

let clientMod;
let stdioMod;
let httpMod;

export async function loadMcpSdkClient() {
  clientMod ??= await importSdkSubpath("client/index.js");
  return clientMod.Client;
}

export async function loadMcpSdkStdioTransport() {
  stdioMod ??= await importSdkSubpath("client/stdio.js");
  return stdioMod.StdioClientTransport;
}

export async function loadMcpSdkStreamableHttpTransport() {
  httpMod ??= await importSdkSubpath("client/streamableHttp.js");
  return httpMod.StreamableHTTPClientTransport;
}
