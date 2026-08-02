/**
 * Gate log path policy for Dashboard status / freshness.
 *
 * - Workspace view: ONLY `<project>/.costgate/logs` (shared across Win/WSL Cursor
 *   when both open the same folder).
 * - Global view: ONLY this host's `~/.costgate/logs` (or COSTGATE_*_LOG_DIR).
 * - Do not merge Windows home ↔ WSL home, or scan other registry projects.
 *
 * Runtime (mcp.json, Gate process) stays per Cursor host; project data is shared.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function workspaceGateLogDir(projectRoot) {
  if (!projectRoot) return null;
  return join(resolve(projectRoot), ".costgate", "logs");
}

export function homeGateLogDir(env = process.env) {
  if (env.COSTGATE_GATE_LOG_DIR) return resolve(env.COSTGATE_GATE_LOG_DIR);
  const probe = env.COSTGATE_PROBE_LOG_DIR;
  if (probe) return resolve(probe);
  const home = env.HOME || env.USERPROFILE || homedir();
  return join(home, ".costgate", "logs");
}

/**
 * Canonical Gate log dir for the current Dashboard scope.
 * @returns {string|null}
 */
export function resolveCanonicalGateLogDir(options = {}) {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot || env.COSTGATE_PROJECT_ROOT || null;
  if (projectRoot) return workspaceGateLogDir(projectRoot);
  if (options.gateLogDir) return resolve(options.gateLogDir);
  if (options.globalGateLogDir) return resolve(options.globalGateLogDir);
  return homeGateLogDir(env);
}

/**
 * Log dirs to scan for gate_event rows (status / freshness).
 * Prefer a single canonical dir; returns a 0–1 length list for callers that loop.
 *
 * @param {object} [options]
 * @param {string|null} [options.gateLogDir] used only in Global view
 * @param {string|null} [options.globalGateLogDir] used only in Global view
 * @param {string|null} [options.projectRoot]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {boolean} [options.includeRegistry] ignored (kept for call-site compat)
 * @param {string} [options.registryPath] ignored
 */
export function collectGateLogDirs(options = {}) {
  const canonical = resolveCanonicalGateLogDir(options);
  return canonical ? [canonical] : [];
}

/** Dirs that currently exist on disk (for diagnostics). */
export function existingGateLogDirs(options = {}) {
  return collectGateLogDirs(options).filter((d) => existsSync(d));
}
