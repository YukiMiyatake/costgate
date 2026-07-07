/**
 * Resolve a project/workspace root from a file or directory path.
 * Walks up looking for .git, go.mod, package.json, or .costgate.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MARKERS = [".git", "go.mod", "package.json", ".costgate"];

export function isPathUnder(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(`${p}/`);
}

/** Shortest known workspace root that contains absPath (outermost project root). */
export function findContainingWorkspaceRoot(absPath, knownRoots = []) {
  if (!absPath) return null;
  let abs;
  try {
    abs = resolve(absPath);
  } catch {
    return null;
  }
  const matches = [...new Set(knownRoots.map((r) => resolve(r)))].filter((r) =>
    isPathUnder(abs, r)
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => a.length - b.length)[0];
}

/**
 * Prefer a known Cursor/Gate workspace root; fall back to marker-based heuristic.
 */
export function normalizeRegistryWorkspacePath(absPath, knownRoots = []) {
  const containing = findContainingWorkspaceRoot(absPath, knownRoots);
  if (containing) return containing;
  return resolveWorkspaceRootFromPath(absPath);
}

/** Drop workspace list entries nested under another entry (monorepo package dirs, etc.). */
export function collapseNestedWorkspacePaths(items) {
  const normalized = (items ?? []).map((item) => ({
    ...item,
    path: resolve(item.path),
  }));
  return normalized.filter(
    (item) =>
      !normalized.some(
        (other) => other.path !== item.path && isPathUnder(item.path, other.path)
      )
  );
}

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
