/**
 * Discover Gate JSONL log directories.
 *
 * Cursor production Gate writes to `<workspace>/.costgate/logs`, while a
 * manually started Dashboard defaults to `~/.costgate/logs`. Without multi-dir
 * discovery the UI shows "Gate 未接続" even when Gate is healthy.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { loadRegistry, registryPath } from "./dashboard-workspaces.mjs";

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
 * Unique absolute log directories to scan for gate_event rows.
 * @param {object} [options]
 * @param {string|null} [options.gateLogDir] primary / scoped dir
 * @param {string|null} [options.globalGateLogDir]
 * @param {string|null} [options.projectRoot]
 * @param {boolean} [options.includeRegistry=true] scan Activity Registry workspaces
 * @param {string} [options.registryPath]
 * @param {NodeJS.ProcessEnv} [options.env]
 */
export function collectGateLogDirs(options = {}) {
  const env = options.env ?? process.env;
  const seen = new Set();
  const dirs = [];

  const add = (dir) => {
    if (!dir) return;
    const abs = resolve(dir);
    if (seen.has(abs)) return;
    seen.add(abs);
    dirs.push(abs);
  };

  add(options.gateLogDir);
  add(options.globalGateLogDir);
  add(homeGateLogDir(env));
  add(workspaceGateLogDir(options.projectRoot));
  add(workspaceGateLogDir(env.COSTGATE_PROJECT_ROOT));

  if (options.includeRegistry !== false) {
    try {
      const reg = loadRegistry(options.registryPath ?? registryPath());
      for (const w of reg.workspaces ?? []) {
        if (w?.path) add(workspaceGateLogDir(w.path));
      }
    } catch {
      // registry optional
    }
  }

  return dirs;
}

/** Dirs that currently exist on disk (for diagnostics). */
export function existingGateLogDirs(options = {}) {
  return collectGateLogDirs(options).filter((d) => existsSync(d));
}
