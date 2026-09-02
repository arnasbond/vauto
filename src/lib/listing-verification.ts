import type { Listing } from "@/lib/types";

/**
 * F7 — verification authority. Three SEPARATE, precise trust badges with
 * strict `=== true` semantics (fail-closed):
 *   - VIN patikrinta        — the vehicle's VIN was verified server-side;
 *   - Pardavėjas patvirtintas — provider/service-seller verified;
 *   - Skelbimas patvirtintas — the listing itself was reviewed/verified.
 * An unverified listing gets NO badge. Forged values (strings, 1, "yes")
 * never earn a badge.
 */
export type TrustBadgeKey = "vin" | "provider" | "listing";

export type TrustBadge = {
  key: TrustBadgeKey;
  label: string;
};

export const TRUST_BADGE_LABELS: Record<TrustBadgeKey, string> = {
  vin: "VIN patikrinta",
  provider: "Pardavėjas patvirtintas",
  listing: "Skelbimas patvirtintas",
};

export function listingTrustBadges(listing: {
  vinVerified?: unknown;
  providerVerified?: unknown;
  isVerified?: unknown;
}): TrustBadge[] {
  const badges: TrustBadge[] = [];
  if (listing.vinVerified === true) {
    badges.push({ key: "vin", label: TRUST_BADGE_LABELS.vin });
  }
  if (listing.providerVerified === true) {
    badges.push({ key: "provider", label: TRUST_BADGE_LABELS.provider });
  }
  if (listing.isVerified === true) {
    badges.push({ key: "listing", label: TRUST_BADGE_LABELS.listing });
  }
  return badges;
}

/** Backwards-compatible convenience for callers that only need a boolean. */
export function hasAnyTrustBadge(listing: Listing): boolean {
  return listingTrustBadges(listing).length > 0;
}
