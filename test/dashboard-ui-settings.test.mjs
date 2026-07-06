#!/usr/bin/env node
/**
 * Dashboard UI settings — locale/timezone normalization and patch.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  normalizeUiSettings,
  patchUiSettings,
  isValidTimezone,
} from "../scripts/lib/dashboard-ui-settings.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempSettingsPath() {
  const dir = join(tmpdir(), `costgate-ui-settings-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, "dashboard-ui.json");
}

function testNormalizeUiSettings() {
  const defaults = normalizeUiSettings({});
  assert(defaults.locale === DEFAULT_LOCALE, "default locale");
  assert(defaults.timezone === DEFAULT_TIMEZONE, "default timezone");
  assert(defaults.version === 1, "version");

  const ja = normalizeUiSettings({ locale: "ja-JP", timezone: "Asia/Tokyo" });
  assert(ja.locale === "ja", "ja-JP → ja");
  assert(ja.timezone === "Asia/Tokyo", "valid timezone kept");

  const badTz = normalizeUiSettings({ timezone: "Not/A/Zone" });
  assert(badTz.timezone === DEFAULT_TIMEZONE, "invalid timezone → UTC");

  const enGb = normalizeUiSettings({ locale: "en-GB" });
  assert(enGb.locale === "en", "en-GB → en");

  console.error("[ui-settings] normalizeUiSettings ok");
}

function testIsValidTimezone() {
  assert(isValidTimezone("UTC"), "UTC valid");
  assert(isValidTimezone("Asia/Tokyo"), "Asia/Tokyo valid");
  assert(!isValidTimezone(""), "empty invalid");
  assert(!isValidTimezone("Invalid/Zone"), "bogus invalid");
  console.error("[ui-settings] isValidTimezone ok");
}

function testPatchUiSettings() {
  const path = tempSettingsPath();
  try {
    const saved = patchUiSettings({ locale: "ja", timezone: "Asia/Tokyo" }, path);
    assert(saved.settings.locale === "ja", "patch locale");
    assert(saved.settings.timezone === "Asia/Tokyo", "patch timezone");

    const updated = patchUiSettings({ locale: "en" }, path);
    assert(updated.settings.locale === "en", "patch locale only");
    assert(updated.settings.timezone === "Asia/Tokyo", "timezone preserved");

    let threw = false;
    try {
      patchUiSettings({ locale: "fr" }, path);
    } catch (e) {
      threw = true;
      assert(String(e.message).includes("unsupported locale"), "unsupported locale error");
    }
    assert(threw, "unsupported locale throws");

    threw = false;
    try {
      patchUiSettings({ timezone: "Not/A/Zone" }, path);
    } catch (e) {
      threw = true;
      assert(String(e.message).includes("invalid timezone"), "invalid timezone error");
    }
    assert(threw, "invalid timezone throws");

    console.error("[ui-settings] patchUiSettings ok");
  } finally {
    rmSync(join(path, ".."), { recursive: true, force: true });
  }
}

function main() {
  testNormalizeUiSettings();
  testIsValidTimezone();
  testPatchUiSettings();
  console.error("[ui-settings] all passed");
}

main();
