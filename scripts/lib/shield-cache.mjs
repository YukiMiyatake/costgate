/**
 * Sanitized shadow file cache — skip rewrite when source is unchanged.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

export const META_SUFFIX = ".cgmeta.json";

export function contentHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function metaPathFor(shadowPath) {
  return `${shadowPath}${META_SUFFIX}`;
}

export function readCacheMeta(shadowPath) {
  const metaFile = metaPathFor(shadowPath);
  if (!existsSync(metaFile)) return null;
  try {
    return JSON.parse(readFileSync(metaFile, "utf8"));
  } catch {
    return null;
  }
}

export function writeCacheMeta(shadowPath, meta) {
  writeFileSync(metaPathFor(shadowPath), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

/**
 * Returns true when an existing shadow file matches the current source fingerprint.
 */
export function isCacheValid(sourcePath, shadowPath, stat, options = {}) {
  if (!existsSync(shadowPath)) return false;

  const meta = readCacheMeta(shadowPath);
  if (!meta) return false;

  const mtimeMs = stat.mtimeMs ?? stat.mtime?.getTime?.() ?? 0;
  const size = stat.size ?? 0;

  if (meta.source !== sourcePath) return false;
  if (meta.mtimeMs !== mtimeMs) return false;
  if (meta.size !== size) return false;
  if (options.mode !== undefined && meta.mode !== options.mode) return false;
  if (options.sessionId && meta.sessionId !== options.sessionId) return false;

  if (options.contentHash && meta.hash !== options.contentHash) return false;

  return true;
}

export function buildCacheMeta(sourcePath, stat, options = {}) {
  const mtimeMs = stat.mtimeMs ?? stat.mtime?.getTime?.() ?? 0;
  return {
    source: sourcePath,
    mtimeMs,
    size: stat.size ?? 0,
    hash: options.contentHash ?? null,
    mode: options.mode ?? null,
    sessionId: options.sessionId ?? null,
    ts: Math.floor(Date.now() / 1000),
  };
}
