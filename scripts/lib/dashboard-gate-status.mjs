/**
 * Gate runtime status for Dashboard (P4).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildGateLogFreshness } from "./dashboard-data.mjs";
import { gateSettingsGeneration, loadGateSettings } from "./gate-settings.mjs";
import { loadToolOverrides, toolOverridesGeneration, toolOverridesPath } from "./dashboard-control.mjs";

function gateLogRowMatchesProject(row, options = {}) {
  const projectRootFilter = options.projectRoot ? resolve(options.projectRoot) : null;
  if (!projectRootFilter) return true;
  const rowRoot = row.project_root ? resolve(row.project_root) : null;
  if (options.strictProjectRoot) {
    return Boolean(rowRoot && rowRoot === projectRootFilter);
  }
  return !rowRoot || rowRoot === projectRootFilter;
}

function latestGateEvent(gateLogDir, event, options = {}) {
  if (!gateLogDir || !existsSync(gateLogDir)) return null;
  let latest = null;
  for (const file of readdirSync(gateLogDir).filter(
    (f) => f.startsWith("gate-") && f.endsWith(".jsonl")
  )) {
    for (const line of readFileSync(join(gateLogDir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.type !== "gate_event" || row.event !== event || !row.ts) continue;
      if (!gateLogRowMatchesProject(row, options)) continue;
      const ts = Date.parse(row.ts);
      if (Number.isNaN(ts)) continue;
      if (!latest || ts > latest.ts) {
        latest = { ts, row };
      }
    }
  }
  return latest;
}

function pickLatestReload(...events) {
  return events.filter(Boolean).sort((a, b) => b.ts - a.ts)[0] ?? null;
}

export function buildGateStatusPayload(options = {}) {
  const now = options.now ?? Date.now();
  const projectRoot = options.projectRoot ?? null;
  const gateSettings = loadGateSettings({
    projectRoot: projectRoot ?? undefined,
    scoped: Boolean(projectRoot),
    globalPath: options.gateSettingsPath,
  });
  const overridesPath = options.overridesPath ?? toolOverridesPath();
  const gateLogDir = options.gateLogDir ?? null;
  const globalGateLogDir = options.globalGateLogDir ?? null;

  const settingsGen = gateSettingsGeneration(gateSettings.settings);
  const overridesGen = toolOverridesGeneration(loadToolOverrides(overridesPath));

  const freshness = buildGateLogFreshness({
    gateLogDir,
    globalGateLogDir,
    projectRoot,
    now,
  });

  const logOpts = {
    projectRoot,
    strictProjectRoot: false,
  };
  const settingsReload = pickLatestReload(
    latestGateEvent(gateLogDir, "settings_reload", logOpts),
    projectRoot && globalGateLogDir && globalGateLogDir !== gateLogDir
      ? latestGateEvent(globalGateLogDir, "settings_reload", {
          ...logOpts,
          strictProjectRoot: true,
        })
      : null
  );
  const overridesReload = latestGateEvent(gateLogDir, "overrides_reload", logOpts);

  const appliedSettingsGen = settingsReload?.row?.config_generation ?? null;
  const appliedOverridesGen = overridesReload?.row?.overrides_generation ?? null;
  const settingsPending = Boolean(
    settingsGen && appliedSettingsGen && settingsGen !== appliedSettingsGen
  );
  const overridesPending = Boolean(
    overridesGen && appliedOverridesGen && overridesGen !== appliedOverridesGen
  );

  const lastReload = pickLatestReload(settingsReload, overridesReload);

  return {
    ok: true,
    connected: freshness.has_events && !freshness.stale,
    gate_log: freshness,
    hot_reload: {
      gate_settings: true,
      tool_overrides: true,
    },
    paths: {
      gate_settings: gateSettings.paths.effective,
      tool_overrides: overridesPath,
    },
    config_generation: {
      gate_settings: settingsGen,
      tool_overrides: overridesGen,
      last_applied_settings: appliedSettingsGen,
      last_applied_overrides: appliedOverridesGen,
    },
    pending_changes: settingsPending || overridesPending,
    pending: {
      gate_settings: settingsPending,
      tool_overrides: overridesPending,
    },
    last_reload_at: lastReload ? new Date(lastReload.ts).toISOString() : null,
    last_reload_event: lastReload?.row?.event ?? null,
  };
}
