/**
 * Graceful Dashboard restart (spawn successor then exit).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearDashboardBrowserOpenedFlag } from "./dashboard-browser-flag.mjs";

const SCRIPTS_ROOT = fileURLToPath(new URL("..", import.meta.url));

function dashboardServerScript() {
  return (
    process.env.COSTGATE_DASHBOARD_SCRIPT ??
    join(SCRIPTS_ROOT, "dashboard-server.mjs")
  );
}

function spawnSuccessor(options = {}) {
  const script = options.script ?? dashboardServerScript();
  if (!existsSync(script)) {
    throw new Error(`dashboard script not found: ${script}`);
  }
  const host = options.host ?? process.env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
  const port = String(options.port ?? process.env.COSTGATE_DASHBOARD_PORT ?? 8787);
  const env = {
    ...process.env,
    ...options.env,
    COSTGATE_DASHBOARD_HOST: host,
    COSTGATE_DASHBOARD_PORT: port,
  };
  if (options.projectRoot) {
    env.COSTGATE_PROJECT_ROOT = options.projectRoot;
  }
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  return child.pid ?? null;
}

/**
 * Spawn a new dashboard process and exit the current one.
 * @param {import("node:http").Server} server
 */
export function scheduleDashboardRestart(server, options = {}) {
  const delayMs = options.delayMs ?? 200;
  const schedule = options.schedule ?? ((fn) => setTimeout(fn, delayMs));
  const exit = options.exit ?? ((code) => process.exit(code));

  schedule(() => {
    try {
      spawnSuccessor(options);
      clearDashboardBrowserOpenedFlag();
    } catch (e) {
      console.error("[dashboard] admin restart:", e.message ?? e);
    }
    server.close(() => exit(0));
  });
}
