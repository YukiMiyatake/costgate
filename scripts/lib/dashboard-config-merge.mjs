/**
 * Phase 30: merge Global (~/.costgate) templates with project-scoped overlays.
 * Project keys override Global keys with the same name.
 */
import { loadToolOverrides, loadMcpDisabled } from "./dashboard-control.mjs";
import { readJson } from "./read-json.mjs";

function loadBackendsMap(configPath) {
  return readJson(configPath)?.backends ?? {};
}

/** Merge two string-keyed maps; project wins on conflict. */
export function mergeNamedRecords(globalMap = {}, projectMap = {}) {
  const merged = { ...(globalMap ?? {}), ...(projectMap ?? {}) };
  const origins = {};
  for (const key of Object.keys(globalMap ?? {})) {
    origins[key] = "global";
  }
  for (const key of Object.keys(projectMap ?? {})) {
    origins[key] = "project";
  }
  return { merged, origins };
}

/**
 * Effective Gate config for dashboard display (and marketplace installed keys).
 * When scoped, Global backends/overrides/disabled are inherited; project overrides.
 */
export function resolveEffectiveConfig(scopedPaths, globalPaths) {
  if (!scopedPaths?.scoped) {
    return {
      backends: loadBackendsMap(scopedPaths.configPath),
      backendOrigins: {},
      overrides: loadToolOverrides(scopedPaths.overridesPath).tools ?? {},
      overrideOrigins: {},
      disabledStore: loadMcpDisabled(scopedPaths.disabledPath),
      config_merge: false,
    };
  }

  const gBackends = loadBackendsMap(globalPaths.configPath);
  const pBackends = loadBackendsMap(scopedPaths.configPath);
  const { merged: backends, origins: backendOrigins } = mergeNamedRecords(gBackends, pBackends);

  const gOverrides = loadToolOverrides(globalPaths.overridesPath).tools ?? {};
  const pOverrides = loadToolOverrides(scopedPaths.overridesPath).tools ?? {};
  const { merged: overrides, origins: overrideOrigins } = mergeNamedRecords(gOverrides, pOverrides);

  const gDisabled = loadMcpDisabled(globalPaths.disabledPath);
  const pDisabled = loadMcpDisabled(scopedPaths.disabledPath);
  const { merged: disabledStore } = mergeNamedRecords(gDisabled, pDisabled);

  return {
    backends,
    backendOrigins,
    overrides,
    overrideOrigins,
    disabledStore,
    config_merge: true,
    global_config_path: globalPaths.configPath,
    project_config_path: scopedPaths.configPath,
  };
}
