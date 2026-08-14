/**
 * Buyer Match Zod schemas — strict.
 */

import { z } from "zod";
import { SearchQuerySchema } from "../ai/search/search-schema.js";
import {
  REASON_CODE_ALLOWLIST,
  TRADEOFF_CODE_ALLOWLIST,
} from "./types.js";
import { BUYER_MATCH_VERSION } from "./version.js";

const ReasonSchema = z.enum(
  REASON_CODE_ALLOWLIST as unknown as [string, ...string[]]
);
const TradeoffSchema = z.enum(
  TRADEOFF_CODE_ALLOWLIST as unknown as [string, ...string[]]
);

export const BuyerPreferencesSchema = z
  .object({
    preferredBrands: z.array(z.string().max(80)).max(16).optional(),
    preferredModels: z.array(z.string().max(80)).max(16).optional(),
    preferredColors: z.array(z.string().max(40)).max(16).optional(),
    preferredConditions: z.array(z.string().max(32)).max(8).optional(),
    preferredFuel: z.array(z.string().max(32)).max(8).optional(),
    preferredTransmission: z.array(z.string().max(32)).max(8).optional(),
    preferredYearMin: z.number().int().min(1950).max(2100).optional(),
    preferredYearMax: z.number().int().min(1950).max(2100).optional(),
    preferredMileageMax: z.number().finite().nonnegative().max(2_000_000).optional(),
    preferredMaxDistanceKm: z.number().finite().positive().max(500).optional(),
    preferDelivery: z.boolean().optional(),
    budgetComfortRatio: z.number().min(0).max(1).optional(),
  })
  .strict();

export const BuyerMatchRequestSchema = z
  .object({
    userId: z.string().max(128).optional(),
    searchQuery: SearchQuerySchema,
    preferences: BuyerPreferencesSchema.optional(),
    /** ONLY ids from the 10B candidate set. */
    candidateListingIds: z.array(z.string().min(1).max(128)).max(500),
  })
  .strict();

export const BuyerMatchResultSchema = z
  .object({
    listingId: z.string().min(1).max(128),
    eligible: z.boolean(),
    matchScore: z.number().min(0).max(100).nullable(),
    confidence: z.number().min(0).max(1),
    reasons: z.array(ReasonSchema).max(24),
    tradeoffs: z.array(TradeoffSchema).max(24),
    version: z.literal(BUYER_MATCH_VERSION),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (!r.eligible && r.matchScore != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ineligible results must have null matchScore",
      });
    }
    if (r.eligible && r.matchScore == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "eligible results require matchScore",
      });
    }
  });

export const BuyerMatchResponseSchema = z
  .object({
    totalCandidatesEvaluated: z.number().int().nonnegative(),
    eligibleCount: z.number().int().nonnegative(),
    /** Primary ranking — eligible only, sorted by matchScore desc. */
    rankedListings: z.array(BuyerMatchResultSchema).max(500),
    /** Ineligible / rejected (not in primary ranking). */
    ineligibleListings: z.array(BuyerMatchResultSchema).max(500).default([]),
    summaryExplanation: z.string().max(2000),
    calculatedAt: z.string().min(10).max(40),
    version: z.literal(BUYER_MATCH_VERSION),
  })
  .strict()
  .superRefine((r, ctx) => {
    for (const row of r.rankedListings) {
      if (!row.eligible) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "primary ranking cannot include ineligible listings",
        });
      }
    }
    if (r.eligibleCount !== r.rankedListings.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "eligibleCount must equal rankedListings length",
      });
    }
  });

export type BuyerPreferencesParsed = z.infer<typeof BuyerPreferencesSchema>;
export type BuyerMatchRequest = z.infer<typeof BuyerMatchRequestSchema>;
export type BuyerMatchResult = z.infer<typeof BuyerMatchResultSchema>;
export type BuyerMatchResponse = z.infer<typeof BuyerMatchResponseSchema>;

export function parseBuyerMatchRequest(raw: unknown): BuyerMatchRequest {
  return BuyerMatchRequestSchema.parse(raw);
}
export function parseBuyerMatchResponse(raw: unknown): BuyerMatchResponse {
  return BuyerMatchResponseSchema.parse(raw);
}
