export type AppThemeId = "light" | "dark";

export interface AppThemeMeta {
  id: AppThemeId;
  label: string;
  description: string;
}

export const APP_THEMES: AppThemeMeta[] = [
  {
    id: "light",
    label: "Šviesi tema",
    description: "Švarus šviesus fonas, subtilus smaragdo akcentas",
  },
  {
    id: "dark",
    label: "Tamsi tema",
    description: "Gilus tamsus fonas, tas pats smaragdo akcentas",
  },
];

export const DEFAULT_APP_THEME: AppThemeId = "light";

/**
 * Strict type guard (17.1-B). Returns true ONLY for the canonical theme ids
 * "light" and "dark". Legacy theme ids ("vauto-original", "light-minimal")
 * intentionally return false so that persistence/settings logic never treats
 * them as a first-class theme; their migration to LIGHT lives in
 * normalizeAppTheme().
 */
export function isAppThemeId(value: string | null | undefined): value is AppThemeId {
  return value === "light" || value === "dark";
}

/**
 * Migrate any persisted/legacy value to a canonical theme id. Legacy light
 * variants ("vauto-original", "light-minimal") and unknown values all settle
 * on the default LIGHT; only explicit "dark" stays dark. Public UX remains
 * LIGHT and DARK only.
 */
export function normalizeAppTheme(value: string | null | undefined): AppThemeId {
  if (value === "dark") return "dark";
  return DEFAULT_APP_THEME;
}

/**
 * MASTER Wave 1 — theme AUTHORITY contract.
 *
 * `AppThemeId` ("light" | "dark") remains the ACTIVE/rendered theme — the
 * value applied to `<html data-app-theme>` and consumed by every CSS rule.
 *
 * `AppThemePreference` is the user's SELECTION, which is one layer above the
 * active theme: an explicit "light"/"dark" choice always wins over the OS,
 * while "system" (the default — including whenever nothing has been
 * explicitly chosen yet, or a legacy/invalid value was persisted) defers to
 * `prefers-color-scheme`. This is the single source of truth for theme
 * resolution; every consumer (bootstrap script, context, settings UI) must
 * go through `normalizeAppThemePreference` + `resolveActiveTheme`.
 */
export type AppThemePreference = AppThemeId | "system";

export interface AppThemePreferenceMeta {
  id: AppThemePreference;
  label: string;
  description: string;
}

export const APP_THEME_PREFERENCES: AppThemePreferenceMeta[] = [
  {
    id: "system",
    label: "Sistemos nustatymas",
    description: "Seka jūsų įrenginio/naršyklės šviesią arba tamsią temą",
  },
  {
    id: "light",
    label: "Šviesi tema",
    description: "Švarus šviesus fonas, subtilus smaragdo akcentas",
  },
  {
    id: "dark",
    label: "Tamsi tema",
    description: "Gilus tamsus fonas, tas pats smaragdo akcentas",
  },
];

export const DEFAULT_APP_THEME_PREFERENCE: AppThemePreference = "system";

/** True only for the three canonical preference values. */
export function isAppThemePreference(
  value: string | null | undefined
): value is AppThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Migrate any persisted/legacy preference value to a canonical one. Only an
 * explicit "light"/"dark" is preserved; everything else (absent key, legacy
 * theme ids, unknown garbage, or an explicit "system") normalizes to
 * "system" — i.e. "no explicit user override" always means "follow the OS".
 */
export function normalizeAppThemePreference(
  value: string | null | undefined
): AppThemePreference {
  if (value === "light" || value === "dark") return value;
  return DEFAULT_APP_THEME_PREFERENCE;
}

/**
 * Resolve the ACTIVE theme from a preference + the current OS/browser
 * `prefers-color-scheme` signal. This is the one function that both the
 * zero-FOUC bootstrap script and AppThemeContext must agree with.
 */
export function resolveActiveTheme(
  preference: AppThemePreference,
  systemPrefersDark: boolean
): AppThemeId {
  if (preference === "light" || preference === "dark") return preference;
  return systemPrefersDark ? "dark" : "light";
}
