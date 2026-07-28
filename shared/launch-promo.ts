/**
 * Launch promo — Starto akcija: 3 mėnesiai nemokamai (0 €), be kortelės.
 * Active by default for the vauto.lt live opening; disable with LAUNCH_PROMO=0.
 * Personal trial: expires_at = activation + LAUNCH_PROMO_TRIAL_MONTHS.
 */

export const LAUNCH_PROMO_TRIAL_MONTHS = 3;

export const LAUNCH_PROMO_BADGE = "0 € (3 mėnesius nemokamai)";

export const LAUNCH_PROMO_SHORT = "3 mėnesius nemokamai";

export const LAUNCH_PROMO_TITLE = "Starto akcija";

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
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_LAUNCH_PROMO
      : undefined,
    typeof process !== "undefined" ? process.env.LAUNCH_PROMO : undefined,
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_VAUTO_LAUNCH_PROMO
      : undefined
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

/** Personal trial end timestamp (ISO) from activation moment. */
export function computeLaunchPromoExpiresAt(
  from: Date = new Date()
): string {
  const end = new Date(from.getTime());
  end.setMonth(end.getMonth() + LAUNCH_PROMO_TRIAL_MONTHS);
  return end.toISOString();
}

/** Whole days remaining until ISO expiry (0 if expired / invalid). */
export function launchPromoDaysRemaining(
  expiresAt?: string | null,
  now: Date = new Date()
): number {
  if (!expiresAt) return 0;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return 0;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isLaunchPromoExpired(
  expiresAt?: string | null,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return false;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return false;
  return end <= now.getTime();
}
