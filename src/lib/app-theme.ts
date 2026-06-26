export type AppThemeId = "vauto-original" | "dark" | "light-minimal";

export interface AppThemeMeta {
  id: AppThemeId;
  label: string;
  description: string;
}

export const APP_THEMES: AppThemeMeta[] = [
  {
    id: "vauto-original",
    label: "VAUTO Originali",
    description: "Švari balta su mėlynais ir oranžiniais akcentais",
  },
  {
    id: "dark",
    label: "Tamsi tema",
    description: "Deep Navy, neoniniai mėlyni akcentai",
  },
  {
    id: "light-minimal",
    label: "Šviesioji minimali",
    description: "Balsvas fonas, minkšti kortelių šešėliai",
  },
];

export const DEFAULT_APP_THEME: AppThemeId = "dark";

export function isAppThemeId(value: string): value is AppThemeId {
  return value === "vauto-original" || value === "dark" || value === "light-minimal";
}
