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
  // Expired paid boosts must never keep TOP/PLUS badges or rank.
  if (!isVisibilityActive(listing)) {
    if (listing.visibilityTier === "free") return "free";
    return "free";
  }

  if (
    listing.visibilityTier === "top" ||
    listing.visibilityTier === "plus" ||
    listing.visibilityTier === "free"
  ) {
    return listing.visibilityTier;
  }

  const plan = effectiveVisibilityTier(listing);
  if (plan >= 2) return "top";
  if (plan === 1) return "plus";
  return "free";
}

export function isTopFeedListing(listing: Listing): boolean {
  return resolveFeedVisibilityTier(listing) === "top";
}

export function isPlusFeedListing(listing: Listing): boolean {
  return resolveFeedVisibilityTier(listing) === "plus";
}

/**
 * Soft interleave instead of hard TOP wall.
 * Pattern: 1 TOP, then up to 2 organics (plus/free), repeat.
 * Preserves relative order within each bucket (already score-sorted).
 */
export function prioritizeFeedTiers<T extends Listing>(listings: T[]): T[] {
  const tops: T[] = [];
  const rest: T[] = [];
  for (const listing of listings) {
    if (resolveFeedVisibilityTier(listing) === "top") tops.push(listing);
    else rest.push(listing);
  }

  if (tops.length === 0) return listings;

  const out: T[] = [];
  let ti = 0;
  let ri = 0;
  while (ti < tops.length || ri < rest.length) {
    if (ti < tops.length) out.push(tops[ti++]);
    for (let k = 0; k < 2 && ri < rest.length; k++) {
      out.push(rest[ri++]);
    }
    if (ti >= tops.length && ri < rest.length) {
      while (ri < rest.length) out.push(rest[ri++]);
      break;
    }
  }
  return out;
}

export function feedTierBadgeLabel(tier: FeedVisibilityTier): string | null {
  if (tier === "top") return "TOP";
  if (tier === "plus") return "Remiamas";
  return null;
}

/** Exported for tests / diagnostics */
export function feedTierSortRank(tier: FeedVisibilityTier): number {
  return TIER_RANK[tier];
}
