/**
 * Ensure CostGate Dashboard is running (Gate MCP startup sidecar).
 * Idempotent: reuses an existing server on the same host/port.
 */
import { spawn, execFile } from "node:child_process";
import {
  existsSync,
} from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboardServer } from "../dashboard-server.mjs";
import {
  browserOpenedFlagPath,
  clearDashboardBrowserOpenedFlag,
  markDashboardBrowserOpened,
  shouldOpenDashboardBrowser as shouldOpenForMode,
} from "./dashboard-browser-flag.mjs";
import {
  dashboardUrl,
  fetchDashboardHealth,
  isDashboardFresh,
  isStaleDashboardCapabilities,
  isStaleDashboardHealth,
  killProcessOnPort,
  probeDashboardApi,
} from "./dashboard-probe.mjs";

const SCRIPTS_ROOT = fileURLToPath(new URL("..", import.meta.url));

export {
  dashboardUrl,
  fetchDashboardHealth,
  isDashboardFresh,
  isStaleDashboardCapabilities,
  isStaleDashboardHealth,
  probeDashboardApi,
};

export function dashboardServerScript() {
  return (
    process.env.COSTGATE_DASHBOARD_SCRIPT ??
    join(SCRIPTS_ROOT, "dashboard-server.mjs")
  );
}

function envTruthy(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

export function isDashboardAutoEnabled(env = process.env) {
  return envTruthy(env.COSTGATE_DASHBOARD_AUTO, true);
}

/** @returns {"always"|"once"|"never"} */
export function resolveDashboardAutoOpen(env = process.env) {
  const raw = env.COSTGATE_DASHBOARD_AUTO_OPEN;
  if (raw == null || raw === "") return "once";
  const v = String(raw).trim().toLowerCase();
  if (["0", "false", "no", "off", "never"].includes(v)) return "never";
  if (["1", "true", "yes", "on", "always"].includes(v)) return "always";
  if (v === "once") return "once";
  return "once";
}

/** @deprecated prefer resolveDashboardAutoOpen */
export function isDashboardAutoOpenEnabled(env = process.env) {
  return resolveDashboardAutoOpen(env) === "always";
}

export function shouldOpenDashboardBrowser(host, port, options = {}) {
  const mode =
    options.openBrowser === false
      ? "never"
      : options.openBrowser === true
        ? "always"
        : resolveDashboardAutoOpen(options.env ?? process.env);
  return shouldOpenForMode(host, port, mode);
}

export {
  browserOpenedFlagPath,
  clearDashboardBrowserOpenedFlag,
  markDashboardBrowserOpened,
} from "./dashboard-browser-flag.mjs";

/** @deprecated prefer isDashboardFresh for gate sidecar */
export async function probeDashboardHealth(options = {}) {
  const detail = await fetchDashboardHealth(options);
  return detail.ok;
}

export function spawnDashboardProcess(options = {}) {
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

export async function waitForDashboardHealth(options = {}) {
  const retries = options.retries ?? 25;
  const intervalMs = options.intervalMs ?? 120;
  for (let i = 0; i < retries; i += 1) {
    if (await isDashboardFresh(options)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function openDashboardInBrowser(url) {
  const plat = platform();
  if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
    execFile("cmd.exe", ["/c", "start", "", url], { stdio: "ignore" }).unref?.();
    return;
  }
  if (plat === "darwin") {
    execFile("open", [url], { stdio: "ignore" }).unref?.();
    return;
  }
  if (plat === "win32") {
    execFile("cmd.exe", ["/c", "start", "", url], { stdio: "ignore" }).unref?.();
    return;
  }
  execFile("xdg-open", [url], { stdio: "ignore" }).unref?.();
}

/**
 * Start dashboard if needed. Returns { url, running, started, opened }.
 */
export async function ensureDashboard(options = {}) {
  const env = { ...process.env, ...options.env };
  const host = options.host ?? env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? env.COSTGATE_DASHBOARD_PORT ?? 8787);
  const url = dashboardUrl(host, port);
  const auto = options.auto ?? isDashboardAutoEnabled(env);
  const openIfNeeded = (host, port) =>
    shouldOpenDashboardBrowser(host, port, { env, openBrowser: options.openBrowser });

  if (!auto) {
    const running = await isDashboardFresh({ host, port });
    return { url, running, started: false, opened: false, skipped: "auto_disabled" };
  }

  const already = await fetchDashboardHealth({ host, port });
  if (already.ok && (await isDashboardFresh({ host, port }))) {
    let opened = false;
    if (openIfNeeded(host, port)) {
      openDashboardInBrowser(url);
      markDashboardBrowserOpened(host, port);
      opened = true;
    }
    return { url, running: true, started: false, opened };
  }
  if (already.ok) {
    await killProcessOnPort(port);
    await new Promise((r) => setTimeout(r, 200));
  }

  const pid = spawnDashboardProcess({
    host,
    port,
    env,
    projectRoot: options.projectRoot ?? env.COSTGATE_PROJECT_ROOT,
  });

  const running = await waitForDashboardHealth({ host, port });
  let opened = false;
  if (running && openIfNeeded(host, port)) {
    openDashboardInBrowser(url);
    markDashboardBrowserOpened(host, port);
    opened = true;
  }

  return { url, running, started: true, opened, pid };
}

/** @internal test helper */
export { createDashboardServer };
