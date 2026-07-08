/**
 * Qualify tool override keys for multi-backend Gate (backend/tool).
 */

/** Return qualified override key when backend is known and name is bare. */
export function qualifyOverrideToolName(name, backend) {
  if (!name || name.includes("/")) return name;
  if (!backend) return name;
  return `${backend}/${name}`;
}

/** Resolve override entry for a tool (qualified key first, then legacy bare name). */
export function resolveToolOverride(name, backend, overrides = {}) {
  const qualified = qualifyOverrideToolName(name, backend);
  if (overrides[qualified]) return overrides[qualified];
  if (overrides[name]) return overrides[name];
  return null;
}

/** True when more than one backend is configured. */
export function isMultiBackend(backends = {}) {
  return Object.keys(backends).length > 1;
}
