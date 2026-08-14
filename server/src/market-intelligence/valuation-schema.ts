/**
 * ValuationResult Zod schema — Market Intelligence 1.0.
 */

import { z } from "zod";
import { MARKET_INTELLIGENCE_VERSION } from "./types.js";

export const ComparableLevelSchema = z.enum([
  "LOCAL_STRICT",
  "LOCAL_RELAXED",
  "CATEGORY_RELAXED",
  "APPROVED_EXTERNAL",
  "INSUFFICIENT_DATA",
]);

export const ValuationResultSchema = z
  .object({
    status: z.enum(["AVAILABLE", "INSUFFICIENT_DATA", "UNSUPPORTED"]),
    currency: z.literal("EUR"),
    estimatedRange: z
      .object({
        low: z.number().finite().nonnegative(),
        median: z.number().finite().nonnegative(),
        high: z.number().finite().nonnegative(),
      })
      .nullable(),
    comparableCount: z.number().int().nonnegative(),
    acceptedComparableCount: z.number().int().nonnegative(),
    excludedOutlierCount: z.number().int().nonnegative(),
    originalComparableCount: z.number().int().nonnegative(),
    comparableLevel: ComparableLevelSchema,
    confidence: z.number().min(0).max(1),
    confidenceBand: z.enum(["HIGH", "MEDIUM", "LOW"]),
    priceBasis: z.enum(["ASKING_PRICE", "TRANSACTION_PRICE", "MIXED"]),
    dataFreshness: z.object({
      newestAt: z.string().nullable(),
      oldestAt: z.string().nullable(),
    }),
    warnings: z.array(z.string().max(240)).max(32),
    methodologyVersion: z.string().max(16),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === "INSUFFICIENT_DATA" && v.estimatedRange != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INSUFFICIENT_DATA must have null estimatedRange",
      });
    }
    if (v.estimatedRange) {
      const { low, median, high } = v.estimatedRange;
      if (!(low <= median && median <= high)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "low <= median <= high required",
        });
      }
    }
    if (v.acceptedComparableCount > v.originalComparableCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "acceptedComparableCount cannot exceed originalComparableCount",
      });
    }
  });

export type ValuationResult = z.infer<typeof ValuationResultSchema>;

export function parseValuationResult(raw: unknown): ValuationResult {
  return ValuationResultSchema.parse(raw);
}

export function insufficientResult(
  warnings: string[],
  extras?: Partial<ValuationResult>
): ValuationResult {
  return parseValuationResult({
    status: "INSUFFICIENT_DATA",
    currency: "EUR",
    estimatedRange: null,
    comparableCount: extras?.comparableCount ?? 0,
    acceptedComparableCount: extras?.acceptedComparableCount ?? 0,
    excludedOutlierCount: extras?.excludedOutlierCount ?? 0,
    originalComparableCount: extras?.originalComparableCount ?? 0,
    comparableLevel: "INSUFFICIENT_DATA",
    confidence: 0,
    confidenceBand: "LOW",
    priceBasis: extras?.priceBasis ?? "ASKING_PRICE",
    dataFreshness: extras?.dataFreshness ?? { newestAt: null, oldestAt: null },
    warnings,
    methodologyVersion: MARKET_INTELLIGENCE_VERSION,
  });
}
