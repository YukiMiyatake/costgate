/**
 * Ensure CostGate Dashboard is running (Gate MCP startup sidecar).
 * Idempotent: reuses an existing server on the same host/port.
 */
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboardServer } from "../dashboard-server.mjs";

const SCRIPTS_ROOT = fileURLToPath(new URL("..", import.meta.url));

export function dashboardServerScript() {
  return (
    process.env.COSTGATE_DASHBOARD_SCRIPT ??
    join(SCRIPTS_ROOT, "dashboard-server.mjs")
  );
}

export function dashboardUrl(host, port) {
  const h = host === "::1" ? "127.0.0.1" : host;
  return `http://${h}:${port}`;
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

export function isDashboardAutoOpenEnabled(env = process.env) {
  return envTruthy(env.COSTGATE_DASHBOARD_AUTO_OPEN, true);
}

export async function probeDashboardHealth(options = {}) {
  const detail = await fetchDashboardHealth(options);
  return detail.ok;
}

/** @returns {{ ok: boolean, data: object | null }} */
export async function fetchDashboardHealth(options = {}) {
  const host = options.host ?? process.env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.COSTGATE_DASHBOARD_PORT ?? 8787);
  const url = `${dashboardUrl(host, port)}/api/health`;
  const timeoutMs = options.timeoutMs ?? 400;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, data: null };
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Pre-i18n dashboard processes lack `ui` on /api/health but still bind the port. */
export function isStaleDashboardHealth(data) {
  return data?.status === "ok" && data.ui == null;
}

function killProcessOnPort(port) {
  return new Promise((resolve) => {
    const done = () => resolve();
    if (process.platform === "win32") {
      execFile(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
        ],
        () => done()
      );
      return;
    }
    execFile("fuser", [`${port}/tcp`, "-k"], () => {
      execFile("sh", ["-c", `lsof -ti :${port} | xargs -r kill 2>/dev/null || true`], () => done());
    });
  });
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
    if (await probeDashboardHealth(options)) return true;
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
  const openBrowser =
    options.openBrowser ?? isDashboardAutoOpenEnabled(env);

  if (!auto) {
    const running = await probeDashboardHealth({ host, port });
    return { url, running, started: false, opened: false, skipped: "auto_disabled" };
  }

  const already = await fetchDashboardHealth({ host, port });
  if (already.ok && !isStaleDashboardHealth(already.data)) {
    return { url, running: true, started: false, opened: false };
  }
  if (already.ok && isStaleDashboardHealth(already.data)) {
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
  if (running && openBrowser) {
    openDashboardInBrowser(url);
    opened = true;
  }

  return { url, running, started: true, opened, pid };
}

/** @internal test helper */
export { createDashboardServer };
