/**
 * VAUTO Design System — semantic token names & layout constants.
 * Visual values live in globals.css; theme IDs remain technical (vauto-original).
 */

export const VAUTO_BRAND_NAME = "VAUTO" as const;

/** Shared border-radius scale (Stripe / Linear inspired) */
export const VAUTO_RADIUS = {
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  full: "9999px",
} as const;

/** CSS custom property names for semantic surfaces */
export const VAUTO_SEMANTIC = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  popover: "--popover",
  mutedForeground: "--muted-foreground",
  border: "--border",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  ring: "--ring",
} as const;
