/**
 * Dashboard reachability / freshness probes (shared by server + launcher).
 */
import { execFile } from "node:child_process";

export function dashboardUrl(host, port) {
  const h = host === "::1" ? "127.0.0.1" : host;
  return `http://${h}:${port}`;
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

export async function probeDashboardApi(options = {}, pathname) {
  const host = options.host ?? process.env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.COSTGATE_DASHBOARD_PORT ?? 8787);
  const timeoutMs = options.timeoutMs ?? 400;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${dashboardUrl(host, port)}${pathname}`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Pre-i18n dashboard processes lack `ui` on /api/health but still bind the port. */
export function isStaleDashboardHealth(data) {
  return data?.status === "ok" && data.ui == null;
}

/** True when health is ok but required APIs (e.g. shield-settings) are missing. */
export function isStaleDashboardCapabilities(data) {
  if (!data || data.status !== "ok") return false;
  if (isStaleDashboardHealth(data)) return true;
  if (data.capabilities?.shield_settings === false) return true;
  if (data.capabilities?.workspace_deep_routes === false) return true;
  return false;
}

/** PATCH workspace mcps/:name is routed (not apiNotFound) on current dashboard builds. */
export async function probeWorkspaceDeepRoutes(options = {}) {
  const host = options.host ?? process.env.COSTGATE_DASHBOARD_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.COSTGATE_DASHBOARD_PORT ?? 8787);
  const timeoutMs = options.timeoutMs ?? 400;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${dashboardUrl(host, port)}/api/workspaces/__costgate_probe__/mcps/__probe__`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
        signal: controller.signal,
      }
    );
    const body = await res.json().catch(() => ({}));
    return body.error !== "not_found";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Health ok and required dashboard APIs available. */
export async function isDashboardFresh(options = {}) {
  const { ok, data } = await fetchDashboardHealth(options);
  if (!ok || !data) return false;
  if (isStaleDashboardCapabilities(data)) return false;
  if (
    data.capabilities?.shield_settings === true &&
    data.capabilities?.workspace_deep_routes === true
  ) {
    return true;
  }
  const shield = await probeDashboardApi(options, "/api/shield-settings");
  if (!shield) return false;
  return probeWorkspaceDeepRoutes(options);
}

export function killProcessOnPort(port) {
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
