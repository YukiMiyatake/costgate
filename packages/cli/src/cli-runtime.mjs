/**
 * Resolve CostGate runtime root (bundled runtime/ or monorepo root in dev).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PKG = join(fileURLToPath(import.meta.url), "..", "..");

export function cliPackageRoot() {
  return CLI_PKG;
}

export function readCliPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(CLI_PKG, "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Directory containing scripts/ and catalog/ (runtime bundle or repo root). */
export function cliRuntimeRoot() {
  if (process.env.COSTGATE_RUNTIME_ROOT) {
    return process.env.COSTGATE_RUNTIME_ROOT;
  }

  const bundled = join(CLI_PKG, "runtime");
  if (existsSync(join(bundled, "scripts", "costgate-gate-launch.mjs"))) {
    return bundled;
  }

  const monorepo = join(CLI_PKG, "..", "..");
  if (existsSync(join(monorepo, "scripts", "costgate-gate-launch.mjs"))) {
    return monorepo;
  }

  throw new Error(
    "CostGate runtime not found. Reinstall @costgate/cli or run from the costgate repository."
  );
}

export function runtimeScriptsDir() {
  return join(cliRuntimeRoot(), "scripts");
}

export function runtimeScript(name) {
  return join(runtimeScriptsDir(), name);
}
