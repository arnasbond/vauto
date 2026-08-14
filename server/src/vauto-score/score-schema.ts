/**
 * VautoScoreResult Zod schema — Score 1.0.
 */

import { z } from "zod";
import { REASON_CODE_ALLOWLIST, SCORE_WEIGHTS } from "./types.js";
import { VAUTO_SCORE_VERSION } from "./version.js";

const ReasonCodeSchema = z.enum(
  REASON_CODE_ALLOWLIST as unknown as [string, ...string[]]
);

export const ScoreComponentSchema = z
  .object({
    score: z.number().min(0).max(100).nullable(),
    weight: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(ReasonCodeSchema).max(24),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.score === 50 && c.confidence === 0 && c.reasonCodes.length === 0) {
      // Soft note only — real N/A check is score === null
    }
    if (c.score != null && (c.score < 0 || c.score > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "component score out of bounds",
      });
    }
  });

export const VautoScoreResultSchema = z
  .object({
    status: z.enum(["AVAILABLE", "PARTIAL", "INSUFFICIENT_DATA"]),
    totalScore: z.number().min(0).max(100).nullable(),
    scoreVersion: z.literal(VAUTO_SCORE_VERSION),
    components: z
      .object({
        priceValue: ScoreComponentSchema,
        listingQuality: ScoreComponentSchema,
        sellerTrust: ScoreComponentSchema,
        demand: ScoreComponentSchema,
        transactionConfidence: ScoreComponentSchema,
      })
      .strict(),
    confidence: z.number().min(0).max(1),
    missingSignals: z.array(z.string().max(80)).max(32),
    warnings: z.array(z.string().max(240)).max(32),
    summaryExplanation: z.string().max(1200),
    calculatedAt: z.string().min(10).max(40),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === "INSUFFICIENT_DATA" && v.totalScore != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INSUFFICIENT_DATA requires totalScore null",
      });
    }
    if (v.totalScore != null && (v.totalScore < 0 || v.totalScore > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "totalScore out of bounds",
      });
    }
    for (const [key, w] of Object.entries(SCORE_WEIGHTS)) {
      const comp = v.components[key as keyof typeof v.components];
      if (Math.abs(comp.weight - w) > 1e-9) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `weight mismatch for ${key}`,
          path: ["components", key, "weight"],
        });
      }
    }
  });

export type ScoreComponentParsed = z.infer<typeof ScoreComponentSchema>;
export type VautoScoreResult = z.infer<typeof VautoScoreResultSchema>;

export function parseVautoScoreResult(raw: unknown): VautoScoreResult {
  return VautoScoreResultSchema.parse(raw);
}
