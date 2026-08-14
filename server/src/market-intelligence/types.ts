/**
 * VAUTO Market Intelligence Engine 1.0 — shared types.
 * LLM never invents prices — deterministic code + trusted market rows only.
 */

export const MARKET_INTELLIGENCE_VERSION = "1.0";

export type PriceSource =
  | "ASKING_PRICE"
  | "TRANSACTION_PRICE"
  | "VERIFIED_EXTERNAL";

export type ComparableLevel =
  | "LOCAL_STRICT"
  | "LOCAL_RELAXED"
  | "CATEGORY_RELAXED"
  | "APPROVED_EXTERNAL"
  | "INSUFFICIENT_DATA";

export type MarketCategory =
  | "vehicles"
  | "electronics"
  | "home"
  | "clothing"
  | "other"
  | "unsupported";

export type MarketSubject = {
  category: MarketCategory;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  location?: string | null;
  condition?: string | null;
  attributes?: Record<string, unknown>;
};

export type MarketObservation = {
  id: string;
  category: MarketCategory;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  location?: string | null;
  condition?: string | null;
  price: number;
  priceSource: PriceSource;
  observedAt: string; // ISO
  /** Fingerprint for dedupe (title+seller+price or external key). */
  dedupeKey?: string;
  attributes?: Record<string, unknown>;
  /** External comps require approved licensing flag. */
  externalApproved?: boolean;
};

export type AskingPriceVsMarket =
  | "BELOW_RANGE"
  | "WITHIN_RANGE"
  | "ABOVE_RANGE"
  | "UNKNOWN";

export type SellDraftPriceAdvice = {
  userPrice: number;
  market: {
    low: number;
    median: number;
    high: number;
  } | null;
  recommendation: string;
  /** Never overwrite user price — advisory only. */
  overwriteUserPrice: false;
  askingPriceVsMarket: AskingPriceVsMarket;
};
