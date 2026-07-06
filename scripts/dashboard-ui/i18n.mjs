/**
 * Dashboard client i18n — locale, timezone, t(), DOM apply.
 */
import en from "./i18n/en.mjs";
import ja from "./i18n/ja.mjs";

const CATALOG = { en, ja };
const STORAGE_LOCALE = "costgate_ui_locale";
const STORAGE_TZ = "costgate_ui_timezone";

let locale = detectBrowserLocale();
let timezone = detectBrowserTimezone();
let messages = CATALOG[locale] ?? en;

function detectBrowserLocale() {
  const stored = localStorage.getItem(STORAGE_LOCALE);
  if (stored && CATALOG[stored]) return stored;
  const lang = (navigator.language || "en").toLowerCase();
  return lang.startsWith("ja") ? "ja" : "en";
}

function detectBrowserTimezone() {
  const stored = localStorage.getItem(STORAGE_TZ);
  if (stored) return stored;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function lookup(obj, key) {
  return key.split(".").reduce((o, part) => (o && o[part] != null ? o[part] : undefined), obj);
}

export function getLocale() {
  return locale;
}

export function getTimezone() {
  return timezone;
}

export function getSupportedLocales() {
  return Object.keys(CATALOG);
}

export function setLocaleAndTimezone(nextLocale, nextTimezone) {
  if (CATALOG[nextLocale]) {
    locale = nextLocale;
    messages = CATALOG[locale];
    localStorage.setItem(STORAGE_LOCALE, locale);
  }
  if (nextTimezone) {
    timezone = nextTimezone;
    localStorage.setItem(STORAGE_TZ, timezone);
  }
  document.documentElement.lang = locale;
}

/**
 * Translate key with optional {var} interpolation. Falls back to `fallback` or key.
 */
export function t(key, vars = {}, fallback) {
  let str = lookup(messages, key);
  if (str == null) str = fallback ?? key;
  if (typeof str !== "string") return fallback ?? key;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  );
}

export function fmt(n) {
  if (n == null) return t("common.dash");
  return Number(n).toLocaleString(locale);
}

export function formatDateTime(iso) {
  if (!iso) return t("common.dash");
  try {
    return new Date(iso).toLocaleString(locale, {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    try {
      return new Date(iso).toLocaleString(locale);
    } catch {
      return iso;
    }
  }
}

export function relativeAge(iso) {
  if (!iso) return t("common.dash");
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return locale === "ja" ? `${sec}秒前` : `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return locale === "ja" ? `${min}分前` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return locale === "ja" ? `${hr}時間前` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return locale === "ja" ? `${day}日前` : `${day}d ago`;
}

export function applyStaticI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const text = t(key);
    if (text) el.textContent = text;
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  const titleKey = root === document ? "app.title" : null;
  if (titleKey && document.title !== t(titleKey)) {
    document.title = t(titleKey);
  }
}

export async function loadUiSettingsFromApi(fetchJson) {
  try {
    const data = await fetchJson("/api/ui-settings");
    const { locale: loc, timezone: tz } = data.settings ?? {};
    setLocaleAndTimezone(loc ?? locale, tz ?? timezone);
    return data;
  } catch {
    setLocaleAndTimezone(locale, timezone);
    return null;
  }
}

export async function saveUiSettingsToApi(fetchJson, patch) {
  const data = await fetchJson("/api/ui-settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  const { locale: loc, timezone: tz } = data.settings ?? {};
  setLocaleAndTimezone(loc ?? locale, tz ?? timezone);
  return data;
}

export function shieldSettingLabel(key, fallback) {
  return t(`shieldSetting.${key}.label`, {}, fallback);
}

export function shieldSettingHint(key, fallback) {
  return t(`shieldSetting.${key}.hint`, {}, fallback);
}

export function gateSettingLabel(key, fallback) {
  return t(`gateSetting.${key}.label`, {}, fallback);
}

export function gateSettingHint(key, fallback) {
  return t(`gateSetting.${key}.hint`, {}, fallback);
}

// Bootstrap from localStorage before API
setLocaleAndTimezone(locale, timezone);
