/**
 * Dashboard UI preferences — locale & timezone.
 * Global: ~/.costgate/dashboard-ui.json
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readJson } from "./read-json.mjs";

export const UI_SETTINGS_VERSION = 1;
export const SUPPORTED_LOCALES = ["en", "ja"];
export const DEFAULT_LOCALE = "en";
export const DEFAULT_TIMEZONE = "UTC";

/** Curated list; browsers may use any IANA zone via PATCH validation. */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function globalUiSettingsPath() {
  return process.env.COSTGATE_DASHBOARD_UI_PATH ?? join(homedir(), ".costgate", "dashboard-ui.json");
}

function normalizeLocale(raw) {
  const v = String(raw ?? "").toLowerCase();
  if (v === "ja" || v.startsWith("ja-")) return "ja";
  if (v === "en" || v.startsWith("en-")) return "en";
  return null;
}

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeUiSettings(raw = {}) {
  const locale = normalizeLocale(raw.locale) ?? DEFAULT_LOCALE;
  const timezone = isValidTimezone(raw.timezone) ? raw.timezone : DEFAULT_TIMEZONE;
  return {
    version: UI_SETTINGS_VERSION,
    locale,
    timezone,
  };
}

export function loadUiSettings(path = globalUiSettingsPath()) {
  const data = readJson(path) ?? {};
  return { settings: normalizeUiSettings(data), path, exists: existsSync(path) };
}

export function saveUiSettings(settings, path = globalUiSettingsPath()) {
  const normalized = normalizeUiSettings(settings);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return { settings: normalized, path };
}

export function patchUiSettings(patch, path = globalUiSettingsPath()) {
  const current = loadUiSettings(path).settings;
  const next = { ...current };
  if (patch.locale !== undefined) {
    const loc = normalizeLocale(patch.locale);
    if (!loc) throw new Error(`unsupported locale: ${patch.locale}`);
    next.locale = loc;
  }
  if (patch.timezone !== undefined) {
    if (!isValidTimezone(patch.timezone)) {
      throw new Error(`invalid timezone: ${patch.timezone}`);
    }
    next.timezone = patch.timezone;
  }
  return saveUiSettings(next, path);
}

export function buildUiSettingsApiPayload(path = globalUiSettingsPath()) {
  const { settings, exists } = loadUiSettings(path);
  return {
    settings,
    path,
    exists,
    supported_locales: SUPPORTED_LOCALES,
    common_timezones: COMMON_TIMEZONES,
    defaults: { locale: DEFAULT_LOCALE, timezone: DEFAULT_TIMEZONE },
  };
}
