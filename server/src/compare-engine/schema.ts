/**
 * Compare Engine Zod schemas — strict.
 */

import { z } from "zod";
import { SearchQuerySchema } from "../ai/search/search-schema.js";
import { BuyerPreferencesSchema } from "../buyer-match/schema.js";
import {
  COMPARE_MAX_LISTINGS,
  COMPARE_MIN_LISTINGS,
  COMPARE_TRADEOFF_ALLOWLIST,
} from "./types.js";
import { COMPARE_ENGINE_VERSION } from "./version.js";

const TradeoffCodeSchema = z.enum(
  COMPARE_TRADEOFF_ALLOWLIST as unknown as [string, ...string[]]
);

export const CompareBuyerContextSchema = z
  .object({
    hardConstraints: SearchQuerySchema.optional(),
    preferences: BuyerPreferencesSchema.optional(),
  })
  .strict()
  .optional();

export const CompareRequestSchema = z
  .object({
    listingIds: z
      .array(z.string().min(1).max(128))
      .min(COMPARE_MIN_LISTINGS)
      .max(COMPARE_MAX_LISTINGS),
    buyerContext: CompareBuyerContextSchema,
    /** Optional requesting user for private listing authorization (IDOR guard). */
    requestUserId: z.string().max(128).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const uniq = new Set(r.listingIds);
    if (uniq.size !== r.listingIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "listingIds must be unique",
        path: ["listingIds"],
      });
    }
  });

export const ComparisonListingSnapshotSchema = z
  .object({
    listingId: z.string().min(1).max(128),
    category: z.string().max(64),
    title: z.string().max(240),
    askingPrice: z.number().finite().nullable(),
    currency: z.string().max(8),
    attributes: z.record(z.string().max(64), z.unknown()),
    vautoScore: z.number().min(0).max(100).nullable().optional(),
    buyerMatchScore: z.number().min(0).max(100).nullable().optional(),
    marketRange: z
      .object({
        low: z.number().finite(),
        median: z.number().finite(),
        high: z.number().finite(),
      })
      .nullable()
      .optional(),
    updatedAt: z.string().min(10).max(40),
  })
  .strict();

export const ListingTradeoffsSchema = z
  .object({
    listingId: z.string().min(1).max(128),
    pros: z.array(TradeoffCodeSchema).max(24),
    cons: z.array(TradeoffCodeSchema).max(24),
  })
  .strict();

export const CompareResponseSchema = z
  .object({
    status: z.enum(["AVAILABLE", "STALE_SNAPSHOT", "UNAUTHORIZED", "INVALID_REQUEST"]),
    compareVersion: z.literal(COMPARE_ENGINE_VERSION),
    comparedListings: z.array(ComparisonListingSnapshotSchema).max(COMPARE_MAX_LISTINGS),
    deltas: z.record(z.string().max(64), z.unknown()),
    tradeoffs: z.array(ListingTradeoffsSchema).max(COMPARE_MAX_LISTINGS),
    keyTakeaways: z.array(z.string().max(240)).max(16),
    aiSummary: z.string().max(4000),
    snapshotCalculatedAt: z.string().min(10).max(40),
    warnings: z.array(z.string().max(240)).max(32).default([]),
    /** Absolute winner listing id — ONLY when buyerContext + match scores present. */
    contextualBestListingId: z.string().max(128).nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = new Set(r.comparedListings.map((l) => l.listingId));
    for (const t of r.tradeoffs) {
      if (r.comparedListings.length > 0 && !ids.has(t.listingId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tradeoff listingId not in compared set",
        });
      }
    }
    if (
      r.contextualBestListingId != null &&
      r.comparedListings.length > 0 &&
      !ids.has(r.contextualBestListingId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "contextualBestListingId must be in compared set",
      });
    }
  });

export type CompareRequest = z.infer<typeof CompareRequestSchema>;
export type ComparisonListingSnapshot = z.infer<
  typeof ComparisonListingSnapshotSchema
>;
export type CompareResponse = z.infer<typeof CompareResponseSchema>;

export function parseCompareRequest(raw: unknown): CompareRequest {
  return CompareRequestSchema.parse(raw);
}
export function parseCompareResponse(raw: unknown): CompareResponse {
  return CompareResponseSchema.parse(raw);
}
