/**
 * Persist Dashboard write token so Gate-spawned servers keep a stable secret
 * and the UI can bootstrap it on loopback without pasting from a hidden console.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export function dashboardWriteTokenPath(env = process.env) {
  if (env.COSTGATE_DASHBOARD_TOKEN_FILE) {
    return env.COSTGATE_DASHBOARD_TOKEN_FILE;
  }
  const home = env.HOME || env.USERPROFILE || homedir();
  return join(home, ".costgate", "dashboard-write-token");
}

export function isLoopbackAddress(addr) {
  if (!addr) return false;
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "localhost" ||
    addr === "::ffff:127.0.0.1"
  );
}

export function isLoopbackRequest(req) {
  return isLoopbackAddress(req?.socket?.remoteAddress);
}

/**
 * @returns {{ token: string, source: "options"|"env"|"file"|"generated", path: string|null, bootstrappable: boolean }}
 */
export function resolveDashboardWriteToken(options = {}) {
  const env = options.env ?? process.env;
  const tokenPath = options.tokenPath ?? dashboardWriteTokenPath(env);

  if (options.writeToken != null && String(options.writeToken).length > 0) {
    return {
      token: String(options.writeToken),
      source: "options",
      path: null,
      bootstrappable: false,
    };
  }

  const fromEnv = env.COSTGATE_DASHBOARD_TOKEN ?? "";
  if (fromEnv) {
    return {
      token: fromEnv,
      source: "env",
      path: null,
      // Env token is still needed in the UI header; allow loopback bootstrap
      // so marketplace / writes work without manual paste.
      bootstrappable: true,
    };
  }

  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, "utf8").trim();
    if (existing) {
      return {
        token: existing,
        source: "file",
        path: tokenPath,
        bootstrappable: true,
      };
    }
  }

  const token = randomBytes(24).toString("hex");
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    token,
    source: "generated",
    path: tokenPath,
    bootstrappable: true,
  };
}
