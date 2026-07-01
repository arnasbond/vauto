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
    description: "Premium šviesi tema — gilus mėlynas akcentas, švarus fonas",
  },
  {
    id: "dark",
    label: "Tamsi tema",
    description: "Gilus navy fonas, subtilūs neoniniai AI akcentai",
  },
  {
    id: "light-minimal",
    label: "Šviesioji minimali",
    description: "Balsvas fonas, minkšti kortelių šešėliai",
  },
];

export const DEFAULT_APP_THEME: AppThemeId = "vauto-original";

export function isAppThemeId(value: string): value is AppThemeId {
  return value === "vauto-original" || value === "dark" || value === "light-minimal";
}
