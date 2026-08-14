/**
 * AI Watch 1.0 — types, policy constants, reason allowlist.
 * Matching is 100% deterministic; LLM only formats notification text.
 */

import type { SearchQuery } from "../ai/search/search-schema.js";

export const WATCH_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h per rule+listing
export const WATCH_DAILY_CAP = 20; // max notifications per user per UTC day
export const WATCH_IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type WatchEventType =
  | "listing_created"
  | "listing_updated"
  | "price_changed"
  | "status_changed";

export type WatchRuleType = "SEARCH_WATCH" | "LISTING_PRICE_WATCH";
export type WatchRuleStatus = "ACTIVE" | "PAUSED" | "DISABLED" | "DELETED";

export type WatchThresholds = {
  minVautoScore?: number;
  minBuyerMatch?: number;
  priceDropPercent?: number;
  priceBelow?: number;
  maxDistanceKm?: number;
};

export const MATCH_REASON_ALLOWLIST = [
  "HARD_CONSTRAINTS_PASSED",
  "NEW_LISTING_MATCH",
  "PRICE_DROP_PERCENT",
  "PRICE_BELOW_THRESHOLD",
  "VAUTO_SCORE_THRESHOLD",
  "BUYER_MATCH_THRESHOLD",
  "DISTANCE_WITHIN_MAX",
  "MEANINGFUL_CHANGE",
  "LISTING_PRICE_WATCH_HIT",
  "SEARCH_WATCH_HIT",
  "NOT_ACTIVE_RULE",
  "HARD_CONSTRAINT_FAIL",
  "NOT_PUBLIC_LISTING",
  "NO_MEANINGFUL_CHANGE",
  "THRESHOLD_FAIL",
  "DEDUP_BLOCKED",
  "COOLDOWN_BLOCKED",
  "DAILY_CAP_BLOCKED",
  "PREFILTER_MISS",
] as const;

export type MatchReasonCode = (typeof MATCH_REASON_ALLOWLIST)[number];
export const MATCH_REASON_SET: ReadonlySet<string> = new Set(MATCH_REASON_ALLOWLIST);

export function isAllowedMatchReason(c: string): c is MatchReasonCode {
  return MATCH_REASON_SET.has(c);
}

/** Listing payload for watch evaluation — server-side trusted fields only. */
export type WatchListingEvent = {
  eventType: WatchEventType;
  listingId: string;
  category: string;
  title: string;
  price: number;
  previousPrice?: number | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  location?: string | null;
  distanceKm?: number | null;
  condition?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  delivery?: string[] | null;
  status?: string | null;
  visibility?: "public" | "private" | "hidden";
  banned?: boolean;
  requiresReview?: boolean;
  ownerUserId?: string | null;
  /** Optional server-computed enrichments (never client-authoritative alone). */
  vautoScore?: number | null;
  buyerMatchScore?: number | null;
  /** For meaningful-change classifier. */
  previousSnapshot?: WatchListingSnapshot | null;
  currentSnapshot?: WatchListingSnapshot | null;
  occurredAt: string;
};

export type WatchListingSnapshot = {
  price: number;
  title: string;
  status?: string | null;
  visibility?: string | null;
  year?: number | null;
  mileage?: number | null;
  brand?: string | null;
  model?: string | null;
  /** Non-meaningful noise fields intentionally omitted from hash. */
  description?: string | null;
  photoOrder?: string[] | null;
};

export type { SearchQuery };
