import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function browserOpenedFlagPath() {
  return join(homedir(), ".costgate", "dashboard.browser_opened");
}

export function markDashboardBrowserOpened(host, port) {
  const flag = browserOpenedFlagPath();
  mkdirSync(dirname(flag), { recursive: true });
  writeFileSync(
    flag,
    `${JSON.stringify({ host, port: Number(port), at: Date.now() })}\n`,
    "utf8"
  );
}

export function clearDashboardBrowserOpenedFlag() {
  const flag = browserOpenedFlagPath();
  if (!existsSync(flag)) return;
  try {
    unlinkSync(flag);
  } catch {
    /* ignore */
  }
}

export function shouldOpenDashboardBrowser(host, port, mode) {
  if (mode === "never") return false;
  if (mode === "always") return true;
  const flag = browserOpenedFlagPath();
  if (!existsSync(flag)) return true;
  try {
    const data = JSON.parse(readFileSync(flag, "utf8"));
    return !(data.host === host && Number(data.port) === Number(port));
  } catch {
    return true;
  }
}
