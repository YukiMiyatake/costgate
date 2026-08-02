/**
 * costgate registry — merge Cursor hooks from bundled runtime scripts.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cliRuntimeRoot } from "./cli-runtime.mjs";

export const DEFAULT_HOOKS_PATH = join(homedir(), ".cursor", "hooks.json");

export async function installRegistryHooks(hooksPath = DEFAULT_HOOKS_PATH) {
  const prev = process.env.COSTGATE_RUNTIME_ROOT;
  const runtimeRoot = cliRuntimeRoot();
  process.env.COSTGATE_RUNTIME_ROOT = runtimeRoot;

  const mod = await import(
    pathToFileURL(join(runtimeRoot, "scripts", "install-cursor-registry-hook.mjs")).href
  );

  const install =
    typeof mod.installCursorRegistryHooksAll === "function"
      ? mod.installCursorRegistryHooksAll
      : mod.installCursorRegistryHooks;
  const result = install({ hooksPath });
  if (prev === undefined) delete process.env.COSTGATE_RUNTIME_ROOT;
  else process.env.COSTGATE_RUNTIME_ROOT = prev;
  return result;
}
