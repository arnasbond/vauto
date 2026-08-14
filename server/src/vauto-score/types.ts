/**
 * VAUTO Score 1.0 — shared types & reason-code allowlist.
 * LLM never invents scores; missing signals are null (N/A), never fake 50.
 */

import type { AskingPriceVsMarket } from "../market-intelligence/types.js";
import type { ValuationResult } from "../market-intelligence/valuation-schema.js";

export const SCORE_WEIGHTS = {
  priceValue: 0.28,
  listingQuality: 0.22,
  sellerTrust: 0.22,
  demand: 0.12,
  transactionConfidence: 0.16,
} as const;

export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS;

/** Allowlisted reason codes — LLM may only verbalize these. */
export const REASON_CODE_ALLOWLIST = [
  // Price / market (10D)
  "PRICE_WITHIN_MARKET_RANGE",
  "PRICE_BELOW_MARKET_RANGE",
  "PRICE_ABOVE_MARKET_RANGE",
  "PRICE_MARKET_UNAVAILABLE",
  "PRICE_ASKING_MISSING",
  // Listing quality
  "COMPLETE_ATTRIBUTES",
  "PARTIAL_ATTRIBUTES",
  "SPARSE_ATTRIBUTES",
  "RICH_PHOTO_SET",
  "ADEQUATE_PHOTO_SET",
  "LIMITED_PHOTO_SET",
  "NO_PHOTOS",
  "USEFUL_DESCRIPTION",
  "THIN_DESCRIPTION",
  "MISSING_DESCRIPTION",
  // Seller trust
  "VERIFIED_SELLER",
  "UNVERIFIED_SELLER",
  "ESTABLISHED_ACCOUNT",
  "NEW_SELLER_NO_HISTORY",
  "LIMITED_TRANSACTION_HISTORY",
  "SOLID_TRANSACTION_HISTORY",
  "LOW_DISPUTE_RATE",
  "ELEVATED_DISPUTE_RATE",
  "RELIABLE_DELIVERY_RECORD",
  "SELLER_SIGNALS_MISSING",
  // Demand
  "HEALTHY_DEMAND",
  "MODERATE_DEMAND",
  "LOW_DEMAND",
  "DEMAND_SIGNALS_MISSING",
  "DEMAND_SPAM_FILTERED",
  // Transaction confidence
  "ESCROW_AVAILABLE",
  "OMNIVA_AVAILABLE",
  "BUYER_PROTECTION_AVAILABLE",
  "LIMITED_PROTECTION_OPTIONS",
  "NO_PROTECTION_OPTIONS",
  "TRANSACTION_SIGNALS_MISSING",
  // Aggregate
  "SCORE_PARTIAL_COVERAGE",
  "SCORE_INSUFFICIENT_COVERAGE",
  "SCORE_FULL_COVERAGE",
] as const;

export type ReasonCode = (typeof REASON_CODE_ALLOWLIST)[number];

export const REASON_CODE_SET: ReadonlySet<string> = new Set(REASON_CODE_ALLOWLIST);

export function isAllowedReasonCode(code: string): code is ReasonCode {
  return REASON_CODE_SET.has(code);
}

export type ScoreComponent = {
  score: number | null;
  weight: number;
  confidence: number;
  reasonCodes: ReasonCode[];
};

export type ListingQualityInput = {
  photoCount?: number | null;
  /** Required attribute keys present (brand, model, year, condition, …). */
  presentAttributeKeys?: string[] | null;
  /** Expected attribute keys for category completeness. */
  expectedAttributeKeys?: string[] | null;
  descriptionLength?: number | null;
  titleLength?: number | null;
};

/**
 * Seller signals — NEVER include name, gender, age, ethnicity, social status.
 */
export type SellerTrustInput = {
  identityVerified?: boolean | null;
  accountAgeDays?: number | null;
  completedTransactions?: number | null;
  successfulDeliveries?: number | null;
  disputeRate?: number | null; // 0–1
  /** Explicit flag: seller has no history yet (new). */
  isNewSeller?: boolean | null;
};

export type DemandEvent = {
  type: "view" | "favorite" | "inquiry";
  at: string; // ISO
  /** Actor id when known — used to filter self / duplicate spam. */
  actorId?: string | null;
  /** Session / fingerprint for bot refresh clustering. */
  sessionKey?: string | null;
};

export type DemandInput = {
  events?: DemandEvent[] | null;
  listingOwnerId?: string | null;
  listingCreatedAt?: string | null;
  now?: Date;
};

export type TransactionConfidenceInput = {
  escrowAvailable?: boolean | null;
  omnivaAvailable?: boolean | null;
  buyerProtectionAvailable?: boolean | null;
};

export type VautoScoreInput = {
  askingPrice?: number | null;
  /** Precomputed 10D valuation — never invent prices inside score engine. */
  marketValuation?: ValuationResult | null;
  /** Or inject a ready askingPriceVsMarket signal from 10D helper. */
  askingPriceVsMarket?: AskingPriceVsMarket | null;
  listing?: ListingQualityInput | null;
  seller?: SellerTrustInput | null;
  demand?: DemandInput | null;
  transaction?: TransactionConfidenceInput | null;
  calculatedAt?: string;
};

export type { AskingPriceVsMarket, ValuationResult };
