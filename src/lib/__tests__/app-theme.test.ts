import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAppThemeId,
  normalizeAppTheme,
  DEFAULT_APP_THEME,
  APP_THEMES,
  isAppThemePreference,
  normalizeAppThemePreference,
  resolveActiveTheme,
  DEFAULT_APP_THEME_PREFERENCE,
  APP_THEME_PREFERENCES,
} from "@/lib/app-theme";

// 17.1-B — strict isAppThemeId type guard: true ONLY for "light" | "dark".
test("isAppThemeId returns true only for canonical themes", () => {
  assert.equal(isAppThemeId("light"), true);
  assert.equal(isAppThemeId("dark"), true);
});

test("isAppThemeId rejects legacy theme ids", () => {
  assert.equal(isAppThemeId("vauto-original"), false);
  assert.equal(isAppThemeId("light-minimal"), false);
});

test("isAppThemeId rejects unknown/edge values", () => {
  assert.equal(isAppThemeId("foo"), false);
  assert.equal(isAppThemeId(""), false);
  assert.equal(isAppThemeId(null as unknown as string), false);
  assert.equal(isAppThemeId(undefined as unknown as string), false);
});

// 17.1-B — normalizeAppTheme migrates legacy values to canonical ones.
test("normalizeAppTheme maps legacy light themes to light", () => {
  assert.equal(normalizeAppTheme("vauto-original"), "light");
  assert.equal(normalizeAppTheme("light-minimal"), "light");
});

test("normalizeAppTheme keeps canonical themes", () => {
  assert.equal(normalizeAppTheme("light"), "light");
  assert.equal(normalizeAppTheme("dark"), "dark");
});

test("normalizeAppTheme falls back to default for unknown/empty values", () => {
  assert.equal(normalizeAppTheme("foo"), DEFAULT_APP_THEME);
  assert.equal(normalizeAppTheme(""), DEFAULT_APP_THEME);
  assert.equal(normalizeAppTheme(null), DEFAULT_APP_THEME);
  assert.equal(normalizeAppTheme(undefined), DEFAULT_APP_THEME);
  assert.equal(DEFAULT_APP_THEME, "light");
});

// 17B contract: the app exposes exactly LIGHT and DARK as first-class themes.
test("APP_THEMES contains exactly light and dark", () => {
  assert.deepEqual(
    APP_THEMES.map((t) => t.id).sort(),
    ["dark", "light"]
  );
});

// ── MASTER Wave 1 — Theme Authority Contract ────────────────────────────

test("isAppThemePreference accepts exactly light/dark/system", () => {
  assert.equal(isAppThemePreference("light"), true);
  assert.equal(isAppThemePreference("dark"), true);
  assert.equal(isAppThemePreference("system"), true);
  assert.equal(isAppThemePreference("foo"), false);
  assert.equal(isAppThemePreference(null), false);
  assert.equal(isAppThemePreference(undefined), false);
});

test("normalizeAppThemePreference preserves explicit light/dark", () => {
  assert.equal(normalizeAppThemePreference("light"), "light");
  assert.equal(normalizeAppThemePreference("dark"), "dark");
});

test("normalizeAppThemePreference maps absent/legacy/unknown/system to system", () => {
  assert.equal(normalizeAppThemePreference(null), "system");
  assert.equal(normalizeAppThemePreference(undefined), "system");
  assert.equal(normalizeAppThemePreference(""), "system");
  assert.equal(normalizeAppThemePreference("system"), "system");
  assert.equal(normalizeAppThemePreference("vauto-original"), "system");
  assert.equal(normalizeAppThemePreference("light-minimal"), "system");
  assert.equal(DEFAULT_APP_THEME_PREFERENCE, "system");
});

// Contract rules A/B — explicit selection always wins over OS, in both directions.
test("resolveActiveTheme: explicit LIGHT wins regardless of OS", () => {
  assert.equal(resolveActiveTheme("light", true), "light");
  assert.equal(resolveActiveTheme("light", false), "light");
});

test("resolveActiveTheme: explicit DARK wins regardless of OS", () => {
  assert.equal(resolveActiveTheme("dark", true), "dark");
  assert.equal(resolveActiveTheme("dark", false), "dark");
});

// Contract rule C — no explicit selection => follow OS preference.
test("resolveActiveTheme: system preference follows OS when no explicit override", () => {
  assert.equal(resolveActiveTheme("system", true), "dark");
  assert.equal(resolveActiveTheme("system", false), "light");
});

// First-visit scenarios (contract tests 1 & 2), expressed as pure functions:
// first visit = no persisted value = normalizeAppThemePreference(null) = "system".
test("first visit + OS LIGHT resolves to LIGHT", () => {
  const pref = normalizeAppThemePreference(null);
  assert.equal(resolveActiveTheme(pref, false), "light");
});

test("first visit + OS DARK resolves to DARK", () => {
  const pref = normalizeAppThemePreference(null);
  assert.equal(resolveActiveTheme(pref, true), "dark");
});

// Persisted-override scenarios (contract tests 3 & 4).
test("persisted LIGHT overrides OS DARK", () => {
  const pref = normalizeAppThemePreference("light");
  assert.equal(resolveActiveTheme(pref, true), "light");
});

test("persisted DARK overrides OS LIGHT", () => {
  const pref = normalizeAppThemePreference("dark");
  assert.equal(resolveActiveTheme(pref, false), "dark");
});

test("APP_THEME_PREFERENCES exposes exactly system, light, dark", () => {
  assert.deepEqual(
    APP_THEME_PREFERENCES.map((t) => t.id).sort(),
    ["dark", "light", "system"]
  );
});
