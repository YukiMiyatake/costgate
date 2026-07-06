/**
 * costgate dashboard — manual Dashboard server.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { cliRuntimeRoot, runtimeScript } from "./cli-runtime.mjs";

export function runDashboard(extraEnv = {}) {
  const runtimeRoot = cliRuntimeRoot();
  const script = runtimeScript("dashboard-server.mjs");
  const env = {
    ...process.env,
    ...extraEnv,
    COSTGATE_RUNTIME_ROOT: runtimeRoot,
    COSTGATE_MARKETPLACE_DIR: join(runtimeRoot, "catalog", "marketplace"),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 0));
  });
}
