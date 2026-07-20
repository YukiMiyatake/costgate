/**
 * Resolve @modelcontextprotocol/sdk when repo node_modules is corrupt (WSL DrvFs).
 * Prefers ~/.costgate/node_modules (Linux-native) over workspace node_modules.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SDK_PKG = "@modelcontextprotocol/sdk";
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

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
    return head.includes("import ") || head.startsWith("export ");
  } catch {
    return false;
  }
}

function sdkRootIfValid(nodeModulesDir) {
  const entry = sdkClientEntryPath(nodeModulesDir);
  if (!isSdkEntryValid(entry)) return null;
  return join(nodeModulesDir, SDK_PKG);
}

/** Walk parents of startDir for node_modules/@modelcontextprotocol/sdk. */
function findWorkspaceSdkRoot(startDir = REPO_ROOT) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const root = sdkRootIfValid(join(dir, "node_modules"));
    if (root) return root;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** @returns {string | null} absolute path to @modelcontextprotocol/sdk package root */
export function resolveSdkRoot() {
  const homeRoot = sdkRootIfValid(costgateNodeModulesDir());
  if (homeRoot) return homeRoot;
  return findWorkspaceSdkRoot();
}

export function sdkLoads() {
  return resolveSdkRoot() != null;
}

const SUBPATH_TO_PACKAGE = {
  "client/index.js": "@modelcontextprotocol/sdk/client",
  "client/stdio.js": "@modelcontextprotocol/sdk/client/stdio",
  "client/streamableHttp.js": "@modelcontextprotocol/sdk/client/streamableHttp",
};

async function importSdkSubpath(subpath) {
  const root = resolveSdkRoot();
  if (root) {
    return import(pathToFileURL(join(root, "dist", "esm", subpath)).href);
  }
  const pkg = SUBPATH_TO_PACKAGE[subpath];
  if (pkg) {
    try {
      return await import(pkg);
    } catch {
      // fall through
    }
  }
  throw new Error(
    "Cannot load @modelcontextprotocol/sdk. Run: npm run cursor:deps (or npm install in the repo on a Linux-native path)"
  );
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
