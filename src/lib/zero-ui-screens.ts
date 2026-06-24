/** Central Zero-UI screen model — intent-driven, no traditional tab navigation. */
export const ZERO_UI_SCREENS = [
  "marketplace",
  "listing_preview",
  "business_dashboard",
  "admin_panel",
] as const;

export type ZeroUiScreen = (typeof ZERO_UI_SCREENS)[number];

export const ZERO_UI_SCREEN_LABELS: Record<ZeroUiScreen, string> = {
  marketplace: "Rinka",
  listing_preview: "Skelbimo peržiūra",
  business_dashboard: "Verslo skydelis",
  admin_panel: "Moderavimas",
};

export function isZeroUiScreen(value: string): value is ZeroUiScreen {
  return (ZERO_UI_SCREENS as readonly string[]).includes(value);
}
