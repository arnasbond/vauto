/**
 * AI Watch Zod schemas — strict.
 */

import { z } from "zod";
import { SearchQuerySchema } from "../ai/search/search-schema.js";
import { MATCH_REASON_ALLOWLIST } from "./types.js";
import { AI_WATCH_VERSION } from "./version.js";

const ReasonSchema = z.enum(
  MATCH_REASON_ALLOWLIST as unknown as [string, ...string[]]
);

export const WatchThresholdsSchema = z
  .object({
    minVautoScore: z.number().min(0).max(100).optional(),
    minBuyerMatch: z.number().min(0).max(100).optional(),
    priceDropPercent: z.number().min(0).max(100).optional(),
    priceBelow: z.number().finite().nonnegative().optional(),
    maxDistanceKm: z.number().finite().positive().max(500).optional(),
  })
  .strict();

export const AiWatchRuleSchema = z
  .object({
    id: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    name: z.string().min(1).max(120),
    type: z.enum(["SEARCH_WATCH", "LISTING_PRICE_WATCH"]),
    status: z.enum(["ACTIVE", "PAUSED", "DISABLED", "DELETED"]),
    structuredQuery: SearchQuerySchema,
    /** For LISTING_PRICE_WATCH — single listing focus. */
    targetListingId: z.string().min(1).max(128).optional(),
    thresholds: WatchThresholdsSchema.optional(),
    createdAt: z.string().min(10).max(40),
    lastEvaluatedAt: z.string().min(10).max(40).optional(),
    lastNotifiedAt: z.string().min(10).max(40).optional(),
    watchVersion: z.literal(AI_WATCH_VERSION),
  })
  .strict();

export const AiWatchMatchResultSchema = z
  .object({
    ruleId: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    listingId: z.string().min(1).max(128),
    isMatch: z.boolean(),
    matchReasons: z.array(ReasonSchema).max(24),
    vautoScore: z.number().min(0).max(100).nullable(),
    buyerMatchScore: z.number().min(0).max(100).nullable(),
    shouldNotify: z.boolean(),
    evaluatedAt: z.string().min(10).max(40),
    eventFingerprint: z.string().max(200).optional(),
    cooldownPassed: z.boolean().optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.shouldNotify && !r.isMatch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "shouldNotify requires isMatch",
      });
    }
  });

export const AiWatchNotificationSchema = z
  .object({
    id: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    ruleId: z.string().min(1).max(128),
    listingId: z.string().min(1).max(128),
    eventFingerprint: z.string().min(8).max(200),
    title: z.string().max(200),
    body: z.string().max(2000),
    createdAt: z.string().min(10).max(40),
    watchVersion: z.literal(AI_WATCH_VERSION),
  })
  .strict();

export type WatchThresholdsParsed = z.infer<typeof WatchThresholdsSchema>;
export type AiWatchRule = z.infer<typeof AiWatchRuleSchema>;
export type AiWatchMatchResult = z.infer<typeof AiWatchMatchResultSchema>;
export type AiWatchNotification = z.infer<typeof AiWatchNotificationSchema>;

export function parseAiWatchRule(raw: unknown): AiWatchRule {
  return AiWatchRuleSchema.parse(raw);
}
export function parseAiWatchMatchResult(raw: unknown): AiWatchMatchResult {
  return AiWatchMatchResultSchema.parse(raw);
}
export function parseAiWatchNotification(raw: unknown): AiWatchNotification {
  return AiWatchNotificationSchema.parse(raw);
}
