import type { Listing } from "@/lib/types";

/**
 * Additive feed boost when Omniva paštomatas shipping is enabled on the listing.
 * Peak ~0.06 — same pattern as priceFitBoost / visibilityBoostScore.
 */
export function computeLogisticsReadyBoost(
  listing: Pick<Listing, "allowPastomatas" | "attributes">
): number {
  if (listing.allowPastomatas === true) return 0.06;
  const fits = String(listing.attributes?.fitsOmnivaLocker ?? "")
    .trim()
    .toLowerCase();
  if (fits === "true" || fits === "1" || fits === "yes") return 0.05;
  const ship = String(
    listing.attributes?.shippingMode ?? listing.attributes?.shippingOptions ?? ""
  ).toLowerCase();
  if (/\bomniva\b|\bpaštomat|\bpastomat/.test(ship)) return 0.04;
  return 0;
}

export function listingOffersOmnivaShipping(
  listing: Pick<Listing, "allowPastomatas" | "attributes" | "title" | "description" | "category">
): boolean {
  if (listing.allowPastomatas === true) return true;
  const fits = String(listing.attributes?.fitsOmnivaLocker ?? "")
    .trim()
    .toLowerCase();
  return fits === "true" || fits === "1" || fits === "yes";
}
