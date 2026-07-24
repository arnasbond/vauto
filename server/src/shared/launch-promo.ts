/**
 * Launch promo — "Pirmas mėnuo NEMOKAMAI" (First Month Free / 0 €).
 * Active by default for the vauto.lt live opening; disable with LAUNCH_PROMO=0.
 */

export const LAUNCH_PROMO_BADGE =
  "Starto akcija: Pirmas mėnuo NEMOKAMAI! (0 €)";

export const LAUNCH_PROMO_SHORT = "Pirmas mėnuo NEMOKAMAI";

function readEnvFlag(
  ...keys: Array<string | undefined>
): boolean | null {
  for (const raw of keys) {
    if (raw == null || raw === "") continue;
    const v = String(raw).trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  }
  return null;
}

/**
 * Launch promo gate. Defaults to ON (0 € checkout) unless explicitly disabled.
 * Client: NEXT_PUBLIC_LAUNCH_PROMO · Server: LAUNCH_PROMO
 */
export function isLaunchPromoActive(): boolean {
  const flagged = readEnvFlag(
    process.env.NEXT_PUBLIC_LAUNCH_PROMO,
    process.env.LAUNCH_PROMO,
    process.env.NEXT_PUBLIC_VAUTO_LAUNCH_PROMO
  );
  if (flagged != null) return flagged;
  return true;
}

/** Apply launch discount — returns 0 € while promo is active. */
export function applyLaunchPromoPrice(priceEur: number): number {
  if (!Number.isFinite(priceEur) || priceEur <= 0) return 0;
  return isLaunchPromoActive() ? 0 : priceEur;
}

export function launchPromoCheckoutLabel(amountEur: number): string {
  if (isLaunchPromoActive() && amountEur <= 0) {
    return LAUNCH_PROMO_BADGE;
  }
  return `${amountEur.toFixed(2)} €`;
}
