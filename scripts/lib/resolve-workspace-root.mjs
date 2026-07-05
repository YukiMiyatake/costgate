/**
 * Resolve a project/workspace root from a file or directory path.
 * Walks up looking for .git, go.mod, package.json, or .costgate.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MARKERS = [".git", "go.mod", "package.json", ".costgate"];

export function resolveWorkspaceRootFromPath(fileOrDir) {
  if (!fileOrDir) return null;
  let dir = String(fileOrDir);
  try {
    const abs = resolve(dir);
    if (existsSync(abs) && !statSync(abs).isDirectory()) {
      dir = dirname(abs);
    } else {
      dir = abs;
    }
  } catch {
    return null;
  }

  let fallback = dir;
  while (true) {
    for (const marker of MARKERS) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return fallback;
}
