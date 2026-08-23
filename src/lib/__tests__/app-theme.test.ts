import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAppThemeId,
  normalizeAppTheme,
  DEFAULT_APP_THEME,
  APP_THEMES,
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
