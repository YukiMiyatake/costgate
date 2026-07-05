/**
 * Gate MCP feature toggles — persisted for Dashboard + launcher.
 * Global: ~/.costgate/gate-settings.json
 * Project: <root>/.costgate/gate-settings.json (overrides Global when scoped)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readJson } from "./read-json.mjs";

export const GATE_SETTINGS_VERSION = 1;

/** Defaults match cursor-mcp production profile. */
export const DEFAULT_GATE_SETTINGS = {
  gate_mode: "filter",
  compress: true,
  code_mode: true,
  intent_dynamic: true,
  intent_probe: true,
  intent_prompt: true,
  static_intent: "",
  compress_max_chars: 12000,
};

export const GATE_SETTING_DEFS = [
  {
    key: "gate_mode",
    env: "COSTGATE_GATE_MODE",
    type: "enum",
    options: ["filter", "transparent"],
    label: "Gate mode",
    hint: "filter = Tier A/B/C reduction; transparent = pass-through",
  },
  {
    key: "compress",
    env: "COSTGATE_COMPRESS",
    type: "boolean",
    label: "Response compression",
    hint: "Truncate large MCP tool results",
  },
  {
    key: "code_mode",
    env: "COSTGATE_CODE_MODE",
    type: "boolean",
    label: "Code mode",
    hint: "Return source outlines instead of full files (via MCP)",
  },
  {
    key: "intent_dynamic",
    env: "COSTGATE_INTENT_DYNAMIC",
    type: "boolean",
    label: "Dynamic intent",
    hint: "Recent tool usage exposes Tier B tools",
  },
  {
    key: "intent_probe",
    env: "COSTGATE_INTENT_PROBE",
    type: "boolean",
    label: "Probe intent",
    hint: "Probe JSONL augments intent keywords",
  },
  {
    key: "intent_prompt",
    env: "COSTGATE_INTENT_PROMPT",
    type: "boolean",
    label: "Prompt intent",
    hint: "Cursor prompt-intent hook augments Tier B",
  },
  {
    key: "static_intent",
    env: "COSTGATE_INTENT",
    type: "string",
    label: "Static intent keywords",
    hint: "Space-separated Tier B keywords (optional)",
  },
  {
    key: "compress_max_chars",
    env: "COSTGATE_COMPRESS_MAX_CHARS",
    type: "number",
    label: "Compress max chars",
    hint: "Max characters kept per tool result when compression is on",
  },
];

export function globalGateSettingsPath() {
  return process.env.COSTGATE_GATE_SETTINGS_PATH ?? join(homedir(), ".costgate", "gate-settings.json");
}

export function projectGateSettingsPath(projectRoot) {
  return join(projectRoot, ".costgate", "gate-settings.json");
}

function normalizeSettings(raw = {}) {
  const out = { version: GATE_SETTINGS_VERSION, ...DEFAULT_GATE_SETTINGS };
  if (raw.gate_mode === "filter" || raw.gate_mode === "transparent") {
    out.gate_mode = raw.gate_mode;
  }
  for (const key of ["compress", "code_mode", "intent_dynamic", "intent_probe", "intent_prompt"]) {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  }
  if (typeof raw.static_intent === "string") out.static_intent = raw.static_intent;
  if (typeof raw.compress_max_chars === "number" && raw.compress_max_chars > 0) {
    out.compress_max_chars = Math.floor(raw.compress_max_chars);
  }
  return out;
}

export function loadGateSettingsFile(path) {
  const raw = readJson(path);
  if (!raw) return null;
  return normalizeSettings(raw);
}

export function loadGateSettings(paths = {}) {
  const globalPath = paths.globalPath ?? globalGateSettingsPath();
  const projectPath = paths.projectPath ?? (paths.projectRoot ? projectGateSettingsPath(paths.projectRoot) : null);
  const global = loadGateSettingsFile(globalPath) ?? normalizeSettings();
  if (!projectPath || !existsSync(projectPath)) {
    return {
      settings: global,
      paths: { global: globalPath, project: projectPath, effective: globalPath },
      origins: Object.fromEntries(Object.keys(global).map((k) => [k, "default"])),
      config_merge: false,
    };
  }
  const project = loadGateSettingsFile(projectPath) ?? {};
  const settings = normalizeSettings({ ...global, ...project });
  const origins = {};
  for (const key of Object.keys(settings)) {
    if (key in project && project[key] !== global[key]) origins[key] = "project";
    else if (key in global) origins[key] = existsSync(globalPath) ? "global" : "default";
    else origins[key] = "default";
  }
  return {
    settings,
    paths: { global: globalPath, project: projectPath, effective: projectPath },
    origins,
    config_merge: true,
  };
}

export function saveGateSettings(settings, paths = {}) {
  const scoped = Boolean(paths.scoped && paths.projectRoot);
  const path = scoped
    ? projectGateSettingsPath(paths.projectRoot)
    : paths.path ?? globalGateSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  const payload = { version: GATE_SETTINGS_VERSION, ...normalizeSettings(settings) };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { path, settings: payload };
}

export function patchGateSettings(partial, paths = {}) {
  const current = loadGateSettings(paths);
  const next = normalizeSettings({ ...current.settings, ...partial });
  const saved = saveGateSettings(next, paths);
  return {
    ...saved,
    requires_gate_restart: true,
    origins: loadGateSettings(paths).origins,
    config_merge: current.config_merge,
  };
}

function boolEnv(v) {
  return v ? "1" : "0";
}

/** Map settings object → COSTGATE_* env vars for Gate process. */
export function gateSettingsToEnv(settings) {
  const s = normalizeSettings(settings);
  return {
    COSTGATE_GATE_MODE: s.gate_mode,
    COSTGATE_COMPRESS: boolEnv(s.compress),
    COSTGATE_CODE_MODE: boolEnv(s.code_mode),
    COSTGATE_INTENT_DYNAMIC: boolEnv(s.intent_dynamic),
    COSTGATE_INTENT_PROBE: boolEnv(s.intent_probe),
    COSTGATE_INTENT_PROMPT: boolEnv(s.intent_prompt),
    COSTGATE_INTENT: s.static_intent ?? "",
    COSTGATE_COMPRESS_MAX_CHARS: String(s.compress_max_chars),
  };
}

/** Merge gate-settings file into env (project root from COSTGATE_PROJECT_ROOT). */
export function applyGateSettingsToEnv(env = process.env) {
  const projectRoot = env.COSTGATE_PROJECT_ROOT;
  const loaded = loadGateSettings({
    projectRoot: projectRoot || undefined,
    scoped: Boolean(projectRoot),
  });
  const merged = { ...env, ...gateSettingsToEnv(loaded.settings) };
  return { env: merged, meta: loaded };
}

export function buildGateSettingsApiPayload(paths = {}) {
  const loaded = loadGateSettings(paths);
  return {
    settings: loaded.settings,
    defs: GATE_SETTING_DEFS,
    paths: loaded.paths,
    origins: loaded.origins,
    config_merge: loaded.config_merge,
    requires_gate_restart: true,
  };
}
