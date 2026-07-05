/**
 * Shared repo paths for scripts and tests.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export function repoRoot() {
  return ROOT;
}

export function gateBin() {
  return process.env.COSTGATE_GATE_BIN ?? join(ROOT, "packages/gate/bin/costgate-gate");
}

export function probeJs() {
  return join(ROOT, "packages/probe/dist/index.js");
}

export function costgateConfig() {
  return process.env.COSTGATE_CONFIG ?? join(homedir(), ".costgate/backends.json");
}

export function probeLogDir() {
  return process.env.COSTGATE_PROBE_LOG_DIR ?? join(homedir(), ".costgate/logs");
}

/** Base env for Gate MCP subprocesses. */
export function baseGateEnv(clientName, extra = {}) {
  return {
    COSTGATE_CONFIG: costgateConfig(),
    COSTGATE_CLIENT: clientName,
    ...extra,
  };
}
