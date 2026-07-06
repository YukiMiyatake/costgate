/**
 * costgate gate — Dashboard sidecar + exec costgate-gate (Cursor MCP entry).
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { cliRuntimeRoot } from "./cli-runtime.mjs";
import { resolveGateBinary } from "./install-gate.mjs";

export async function runGate(extraEnv = {}) {
  const runtimeRoot = cliRuntimeRoot();
  const gateBin = await resolveGateBinary();
  const launch = join(runtimeRoot, "scripts", "costgate-gate-launch.mjs");

  const env = {
    ...process.env,
    ...extraEnv,
    COSTGATE_RUNTIME_ROOT: runtimeRoot,
    COSTGATE_GATE_BIN: gateBin,
    COSTGATE_MARKETPLACE_DIR: join(runtimeRoot, "catalog", "marketplace"),
    COSTGATE_DASHBOARD_SCRIPT: join(runtimeRoot, "scripts", "dashboard-server.mjs"),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launch], {
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`costgate-gate exited on signal ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}
