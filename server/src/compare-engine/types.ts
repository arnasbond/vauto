/**
 * Compare Engine 1.0 — types & allowlists.
 * LLM is never a fact source; all deltas/tradeoffs are deterministic.
 */

export const COMPARE_MIN_LISTINGS = 2;
export const COMPARE_MAX_LISTINGS = 4;

/** Deterministic delta keys. */
export const DELTA_KEYS = [
  "PRICE_DIFF_EUR",
  "MILEAGE_DIFF_KM",
  "YEAR_DIFF",
  "DISTANCE_DIFF_KM",
  "VAUTO_SCORE_DIFF",
  "BUYER_MATCH_DIFF",
  "STORAGE_DIFF_GB",
] as const;

export type DeltaKey = (typeof DELTA_KEYS)[number];

/** Allowlisted tradeoff / pro-con codes. */
export const COMPARE_TRADEOFF_ALLOWLIST = [
  "LOWER_PRICE",
  "NEWER_YEAR",
  "LOWER_MILEAGE",
  "HIGHER_VAUTO_SCORE",
  "HIGHER_BUYER_MATCH",
  "CLOSER_DISTANCE",
  "HIGHER_PRICE",
  "HIGHER_MILEAGE",
  "OLDER_YEAR",
  "LOWER_MATCH",
  "LOWER_VAUTO_SCORE",
  "FARTHER_DISTANCE",
  "BETTER_CONDITION",
  "WORSE_CONDITION",
  "HAS_WARRANTY",
  "NO_WARRANTY",
  "HAS_DELIVERY",
  "NO_DELIVERY",
  "MORE_STORAGE",
  "LESS_STORAGE",
] as const;

export type CompareTradeoffCode = (typeof COMPARE_TRADEOFF_ALLOWLIST)[number];

export const COMPARE_TRADEOFF_SET: ReadonlySet<string> = new Set(
  COMPARE_TRADEOFF_ALLOWLIST
);

export function isAllowedCompareTradeoff(c: string): c is CompareTradeoffCode {
  return COMPARE_TRADEOFF_SET.has(c);
}

export type CompareCategory = "automotive" | "electronics" | "generic" | "mixed";

/**
 * Authorized DB listing record for compare — server-loaded only.
 * Client-supplied scores are ignored; server attaches vautoScore / buyerMatch.
 */
export type CompareListingRecord = {
  id: string;
  title: string;
  category: string;
  price: number | null;
  currency?: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  bodyType?: string | null;
  condition?: string | null;
  color?: string | null;
  distanceKm?: number | null;
  delivery?: string[] | null;
  /** Electronics */
  storageGb?: number | null;
  /** Only if verified / user-confirmed — never guessed. */
  batteryHealthPercent?: number | null;
  batteryHealthVerified?: boolean | null;
  warrantyMonths?: number | null;
  /** Server-computed optional enrichment (never trust client). */
  vautoScore?: number | null;
  buyerMatchScore?: number | null;
  marketRange?: { low: number; median: number; high: number } | null;
  updatedAt: string;
  /** Stale protection */
  priceSnapshot?: number | null;
  criticalHash?: string | null;
  /** Authorization: owner / public visibility */
  visibility?: "public" | "private" | "hidden";
  ownerUserId?: string | null;
  banned?: boolean;
  status?: string | null;
};

export type CompareAttributeMap = Record<string, unknown | null>;
