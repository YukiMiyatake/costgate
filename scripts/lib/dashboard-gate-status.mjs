/**
 * Gate runtime status for Dashboard (P4).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildGateLogFreshness } from "./dashboard-data.mjs";
import { loadGateSettings } from "./gate-settings.mjs";
import { toolOverridesPath } from "./dashboard-control.mjs";

function fileGeneration(path) {
  if (!path || !existsSync(path)) return null;
  const st = statSync(path);
  return createHash("sha256")
    .update(`${st.mtimeMs}:${st.size}:${path}`)
    .digest("hex")
    .slice(0, 16);
}

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

  const settingsGen = fileGeneration(gateSettings.paths.effective ?? gateSettings.paths.global);
  const overridesGen = fileGeneration(overridesPath);
  const combinedGen = createHash("sha256")
    .update(`${settingsGen ?? ""}:${overridesGen ?? ""}`)
    .digest("hex")
    .slice(0, 16);

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
  const settingsReload = latestGateEvent(gateLogDir, "settings_reload", logOpts);
  const globalSettingsReload =
    projectRoot && globalGateLogDir && globalGateLogDir !== gateLogDir
      ? latestGateEvent(globalGateLogDir, "settings_reload", {
          ...logOpts,
          strictProjectRoot: true,
        })
      : null;

  let lastReload = settingsReload;
  if (
    globalSettingsReload &&
    (!lastReload || globalSettingsReload.ts > lastReload.ts)
  ) {
    lastReload = globalSettingsReload;
  }

  const appliedGen = lastReload?.row?.config_generation ?? null;
  const pendingChanges = Boolean(combinedGen && appliedGen && combinedGen !== appliedGen);

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
      combined: combinedGen,
      last_applied: appliedGen,
    },
    pending_changes: pendingChanges,
    last_reload_at: lastReload ? new Date(lastReload.ts).toISOString() : null,
    last_reload_event: lastReload?.row?.event ?? null,
  };
}
