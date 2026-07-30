import type { Listing, UserProfile } from "@/lib/types";
import { computeLogisticsReadyBoost } from "@/lib/logistics-ready";

/** Internal listing attribute keys stamped at publish for feed ranking. */
export const B2B_ATTR_PRO = "_b2bPro";
export const B2B_ATTR_BUSINESS = "_b2bBusiness";
export const B2B_ATTR_VERIFIED = "_b2bVerified";

export type B2bTrustSeller = Pick<
  UserProfile,
  "role" | "profileType" | "companyCode"
>;

function attrFlag(
  attributes: Listing["attributes"] | undefined,
  key: string
): boolean {
  const raw = attributes?.[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/** Persist Pro / business / verified flags on listing attributes (public-safe). */
export function stampB2bSellerAttributes(
  attributes: Listing["attributes"] | undefined,
  seller: B2bTrustSeller | null | undefined
): NonNullable<Listing["attributes"]> {
  const next: NonNullable<Listing["attributes"]> = { ...(attributes ?? {}) };
  if (!seller) return next;

  if (seller.role === "pro") next[B2B_ATTR_PRO] = "true";
  else delete next[B2B_ATTR_PRO];

  if (seller.profileType === "business") next[B2B_ATTR_BUSINESS] = "true";
  else delete next[B2B_ATTR_BUSINESS];

  if (String(seller.companyCode ?? "").trim().length >= 5) {
    next[B2B_ATTR_VERIFIED] = "true";
  } else delete next[B2B_ATTR_VERIFIED];

  return next;
}

/**
 * Additive feed boost for verified Pro business sellers with active Omniva logistics.
 * Peak ~0.05 — sits beside priceFitBoost / logisticsReadyBoost.
 */
export function computeB2bTrustBoost(
  listing: Pick<
    Listing,
    "allowPastomatas" | "attributes" | "providerVerified" | "isVerified"
  >,
  seller?: B2bTrustSeller | null
): number {
  if (computeLogisticsReadyBoost(listing) <= 0) return 0;

  const isPro =
    seller?.role === "pro" ||
    attrFlag(listing.attributes, B2B_ATTR_PRO) ||
    listing.providerVerified === true;

  const isBusiness =
    seller?.profileType === "business" ||
    attrFlag(listing.attributes, B2B_ATTR_BUSINESS) ||
    listing.providerVerified === true;

  if (!isPro && !isBusiness) return 0;

  const verified =
    String(seller?.companyCode ?? "").trim().length >= 5 ||
    attrFlag(listing.attributes, B2B_ATTR_VERIFIED) ||
    listing.isVerified === true ||
    listing.providerVerified === true;

  // Require Pro (or provider) + business/verified signal for full boost.
  if (isPro && (isBusiness || verified)) return verified ? 0.05 : 0.04;
  if (isBusiness && verified) return 0.035;
  return 0;
}
