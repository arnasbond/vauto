/**
 * Buyer Match 1.0 — types, weights, allowlists.
 * Discriminatory fields (age/gender/ethnicity/religion/health/politics/SES) are NOT accepted.
 */

import type { SearchQuery } from "../ai/search/search-schema.js";

export const MATCH_WEIGHTS = {
  budgetFit: 0.18,
  ageFit: 0.12,
  mileageFit: 0.1,
  distanceFit: 0.14,
  preferenceFit: 0.16,
  vautoScoreFit: 0.14,
  sellerSignalFit: 0.08,
  deliveryFit: 0.08,
} as const;

export type MatchComponentKey = keyof typeof MATCH_WEIGHTS;

/** Max candidates passed to AI explanation (top-N guard). */
export const EXPLANATION_TOP_N = 5;

export const REASON_CODE_ALLOWLIST = [
  "WITHIN_BUDGET",
  "EXACT_BRAND_MATCH",
  "EXACT_MODEL_MATCH",
  "YEAR_WITHIN_PREFERENCE",
  "LOW_MILEAGE_FIT",
  "LOW_DISTANCE",
  "STRONG_VAUTO_SCORE",
  "VERIFIED_SELLER_SIGNAL",
  "DELIVERY_AVAILABLE",
  "COLOR_PREFERENCE_MATCH",
  "CONDITION_PREFERENCE_MATCH",
  "FUEL_PREFERENCE_MATCH",
  "TRANSMISSION_PREFERENCE_MATCH",
  "SOFT_PREFERENCE_ALIGNED",
] as const;

export const TRADEOFF_CODE_ALLOWLIST = [
  "HIGHER_MILEAGE_THAN_TOP_RESULT",
  "PRICE_NEAR_BUDGET_LIMIT",
  "DELIVERY_NOT_AVAILABLE",
  "FARTHER_THAN_TOP_RESULT",
  "OLDER_YEAR_THAN_PREFERRED",
  "LOWER_VAUTO_SCORE_THAN_TOP",
  "MISSING_MILEAGE_SIGNAL",
  "MISSING_DISTANCE_SIGNAL",
  "MISSING_COLOR_SIGNAL",
  "MISSING_DELIVERY_SIGNAL",
  "SOFT_PREFERENCE_PARTIAL",
] as const;

export type ReasonCode = (typeof REASON_CODE_ALLOWLIST)[number];
export type TradeoffCode = (typeof TRADEOFF_CODE_ALLOWLIST)[number];

export const REASON_CODE_SET: ReadonlySet<string> = new Set(REASON_CODE_ALLOWLIST);
export const TRADEOFF_CODE_SET: ReadonlySet<string> = new Set(TRADEOFF_CODE_ALLOWLIST);

export function isAllowedReasonCode(c: string): c is ReasonCode {
  return REASON_CODE_SET.has(c);
}
export function isAllowedTradeoffCode(c: string): c is TradeoffCode {
  return TRADEOFF_CODE_SET.has(c);
}

/**
 * Soft buyer preferences — never hard-fail ranking eligibility.
 * Forbidden: age, gender, ethnicity, religion, health, politics, SES.
 */
export type BuyerPreferences = {
  preferredBrands?: string[];
  preferredModels?: string[];
  preferredColors?: string[];
  preferredConditions?: string[];
  preferredFuel?: string[];
  preferredTransmission?: string[];
  /** Soft year preference (hard year lives on SearchQuery). */
  preferredYearMin?: number;
  preferredYearMax?: number;
  /** Soft mileage ceiling (hard mileageMax on SearchQuery). */
  preferredMileageMax?: number;
  /** Soft max distance preference. */
  preferredMaxDistanceKm?: number;
  /** Prefer listings with delivery options. */
  preferDelivery?: boolean;
  /** Soft budget comfort zone below hard priceMax (0–1 of budget). */
  budgetComfortRatio?: number;
};

export type MatchListingRecord = {
  id: string;
  title: string;
  price: number;
  location: string;
  category: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  condition?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  color?: string | null;
  delivery?: string[] | null;
  distanceKm?: number | null;
  /** Body style / body type when known (automotive). */
  bodyType?: string | null;
  sellerVerified?: boolean | null;
  /** Optional 10E score — soft signal only. */
  vautoScore?: number | null;
  /** Must NOT affect organic matchScore. */
  sponsored?: boolean | null;
  promoted?: boolean | null;
  createdAt?: string;
  /** Snapshot for revalidation between 10B and 10F. */
  priceSnapshot?: number | null;
  criticalHash?: string | null;
};

export type NormalizedPreferences = {
  hard: SearchQuery;
  soft: BuyerPreferences;
};

export type MatchFeatureVector = {
  listingId: string;
  budgetFit: number | null;
  ageFit: number | null;
  mileageFit: number | null;
  distanceFit: number | null;
  preferenceFit: number | null;
  vautoScoreFit: number | null;
  sellerSignalFit: number | null;
  deliveryFit: number | null;
  reasons: ReasonCode[];
  tradeoffs: TradeoffCode[];
  /** Fraction of components that had real data (not unknown). */
  dataCoverage: number;
};

export type { SearchQuery };
