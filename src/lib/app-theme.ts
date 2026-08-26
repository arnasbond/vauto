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
