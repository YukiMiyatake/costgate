/**
 * Trust → Shield redact mode (mirrors packages/gate/internal/shield/trust.go).
 */
import { loadMcpTrust } from "./mcp-trust.mjs";
import { Mode } from "./shield-redact.mjs";

const TRUST_TO_MODE = {
  trusted: Mode.Off,
  standard: Mode.Secrets,
  restricted: Mode.Aggressive,
  untrusted: Mode.Full,
};

/** Map an MCP trust level string to a Shield redact Mode. */
export function trustToRedactMode(trust) {
  return TRUST_TO_MODE[trust] ?? Mode.Aggressive;
}

/**
 * Resolve redact mode for Agent Read sanitization.
 * Uses project trust defaults (unknown → restricted/aggressive by default).
 */
export function redactModeForRead(context = {}) {
  if (context.mode !== undefined) return context.mode;

  const trustPaths = context.trustPaths ?? {};
  if (context.projectRoot && !trustPaths.projectRoot) {
    trustPaths.projectRoot = context.projectRoot;
  }
  const loaded = context.trust ?? loadMcpTrust(trustPaths);
  const level = loaded.config.defaults.unknown ?? "restricted";
  return trustToRedactMode(level);
}
