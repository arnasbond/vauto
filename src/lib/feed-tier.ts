import type { Listing } from "@/lib/types";
import {
  effectiveVisibilityTier,
  isVisibilityActive,
} from "@/lib/visibility-plans";

/** Marktplaats-style feed promotion tier (monetization display). */
export type FeedVisibilityTier = "free" | "plus" | "top";

const TIER_RANK: Record<FeedVisibilityTier, number> = {
  top: 0,
  plus: 1,
  free: 2,
};

export function resolveFeedVisibilityTier(listing: Listing): FeedVisibilityTier {
  if (
    listing.visibilityTier === "top" ||
    listing.visibilityTier === "plus" ||
    listing.visibilityTier === "free"
  ) {
    return listing.visibilityTier;
  }

  if (isVisibilityActive(listing)) {
    const plan = effectiveVisibilityTier(listing);
    if (plan >= 2) return "top";
    if (plan === 1) return "plus";
  }

  if (listing.promoted) return "top";
  return "free";
}

export function isTopFeedListing(listing: Listing): boolean {
  return resolveFeedVisibilityTier(listing) === "top";
}

export function isPlusFeedListing(listing: Listing): boolean {
  return resolveFeedVisibilityTier(listing) === "plus";
}

/** TOP first, then PLUS, then FREE — stable within each group. */
export function prioritizeFeedTiers<T extends Listing>(listings: T[]): T[] {
  return [...listings].sort((a, b) => {
    const ra = TIER_RANK[resolveFeedVisibilityTier(a)];
    const rb = TIER_RANK[resolveFeedVisibilityTier(b)];
    if (ra !== rb) return ra - rb;
    return 0;
  });
}

export function feedTierBadgeLabel(tier: FeedVisibilityTier): string | null {
  if (tier === "top") return "TOP";
  if (tier === "plus") return "Remiamas";
  return null;
}
