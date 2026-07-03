/** Canonical production origin for VAUTO (no trailing slash). */
export const DEFAULT_SITE_URL = "https://www.vauto.lt";

/** Resolve the public site origin from env or the production default. */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_VAUTO_URL?.trim();
  return (fromEnv || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** Build-time snapshot — prefer `getSiteUrl()` when env may change at runtime. */
export const SITE_URL = getSiteUrl();
