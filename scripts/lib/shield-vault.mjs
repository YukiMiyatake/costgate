/**
 * Shield vault — placeholder ↔ original mappings (JS port of gate/internal/shield/vault.go).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PLACEHOLDER_PREFIX = "[[CG:";
export const PLACEHOLDER_SUFFIX = "]]";
export const PLACEHOLDER_PATTERN = /\[\[CG:([A-Z0-9_]+):([a-f0-9]{4})\]\]/g;

const DEFAULT_TTL_SEC = 86400;

export function vaultDir() {
  return process.env.COSTGATE_SHIELD_DIR ?? join(homedir(), ".costgate", "vault");
}

export function sessionId() {
  return process.env.COSTGATE_SHIELD_SESSION ?? process.env.COSTGATE_CLIENT ?? "default";
}

function shortId(kind, value) {
  return createHash("sha256").update(`${kind}\x00${value}`).digest("hex").slice(0, 4);
}

export function formatPlaceholder(kind, id) {
  return `${PLACEHOLDER_PREFIX}${kind}:${id}${PLACEHOLDER_SUFFIX}`;
}

export class ShieldVault {
  constructor(options = {}) {
    this.dir = options.dir ?? vaultDir();
    this.sessionId = options.sessionId ?? sessionId();
    const ttlEnv = process.env.COSTGATE_SHIELD_VAULT_TTL_SEC;
    const parsedTtl = ttlEnv ? Number.parseInt(ttlEnv, 10) : DEFAULT_TTL_SEC;
    this.ttlSec = options.ttlSec ?? (Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : DEFAULT_TTL_SEC);
    this.entries = {};
    this.dirty = false;
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.load();
  }

  filePath() {
    const safe = this.sessionId.replace(/[/\\:]/g, "_");
    return join(this.dir, `${safe}.json`);
  }

  load() {
    const path = this.filePath();
    if (!existsSync(path)) return;
    let data;
    try {
      data = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return;
    }
    const entries = data?.entries ?? {};
    const now = Math.floor(Date.now() / 1000);
    for (const [id, entry] of Object.entries(entries)) {
      if (this.ttlSec > 0 && now - (entry.ts ?? 0) > this.ttlSec) continue;
      this.entries[id] = entry;
    }
  }

  save() {
    if (!this.dirty) return;
    const path = this.filePath();
    const tmp = `${path}.tmp`;
    writeFileSync(
      tmp,
      `${JSON.stringify({ entries: this.entries }, null, 2)}\n`,
      { mode: 0o600 }
    );
    renameSync(tmp, path);
    this.dirty = false;
  }

  /** Store a secret and return its placeholder token. */
  store(kind, value) {
    const id = shortId(kind, value);
    const existing = this.entries[id];
    if (existing?.value === value) {
      return formatPlaceholder(kind, id);
    }
    this.entries[id] = { kind, value, ts: Math.floor(Date.now() / 1000) };
    this.dirty = true;
    this.save();
    return formatPlaceholder(kind, id);
  }

  lookup(id) {
    const entry = this.entries[id];
    if (!entry) return null;
    const now = Math.floor(Date.now() / 1000);
    if (this.ttlSec > 0 && now - (entry.ts ?? 0) > this.ttlSec) {
      delete this.entries[id];
      this.dirty = true;
      this.save();
      return null;
    }
    return entry.value;
  }
}

export function unredactString(text, vault) {
  if (!text || !vault) return text;
  return text.replace(PLACEHOLDER_PATTERN, (token, _kind, id) => {
    const val = vault.lookup(id);
    return val ?? token;
  });
}
