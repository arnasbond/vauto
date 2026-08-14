/**
 * Negotiation Copilot — Zod schemas.
 * Forbidden: client prices, secret floors, execute commands.
 */

import { z } from "zod";
import { NEGOTIATION_COPILOT_VERSION } from "./version.js";
import { RECOMMENDATION_TYPES, SIGNAL_CODES } from "./types.js";

export const CopilotGoalSchema = z.enum([
  "maximize_price",
  "close_quickly",
  "balanced",
  "explore",
]);

export const RecommendBodySchema = z
  .object({
    goal: CopilotGoalSchema.optional().default("balanced"),
    /** Soft preference only — never treated as opposite party's secret. */
    preferencesNote: z.string().max(500).optional(),
    expectedTransactionVersion: z.number().int().nonnegative().optional(),
    expectedActiveOfferVersion: z.number().int().nonnegative().nullable().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const forbidden = [
      "askingPrice",
      "marketValuation",
      "vautoScore",
      "sellerMin",
      "buyerMax",
      "activeOffer",
      "status",
      "execute",
      "amountCents",
      "sellerId",
      "buyerId",
    ] as const;
    for (const k of forbidden) {
      if (k in (body as Record<string, unknown>)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `client_${k}_forbidden`,
        });
      }
    }
  });

export const DraftMessageBodySchema = RecommendBodySchema;

export const RecommendationTypeSchema = z.enum(RECOMMENDATION_TYPES);
export const SignalCodeSchema = z.enum(SIGNAL_CODES);

export const CopilotRecommendationSchema = z
  .object({
    recommendationType: RecommendationTypeSchema,
    signals: z.array(
      z
        .object({
          code: SignalCodeSchema,
          value: z.number().nullable(),
          detail: z.string(),
        })
        .strict()
    ),
    bounds: z
      .object({
        suggestedCounterMinCents: z.number().int().positive().nullable(),
        suggestedCounterMaxCents: z.number().int().positive().nullable(),
        askingCents: z.number().int().positive().nullable(),
        activeOfferCents: z.number().int().positive().nullable(),
        marketLowCents: z.number().int().positive().nullable(),
        marketMedianCents: z.number().int().positive().nullable(),
        marketHighCents: z.number().int().positive().nullable(),
        deltaPercentVsAsking: z.number().nullable(),
      })
      .strict(),
    explanationLt: z.string().max(4000),
    draftMessageLt: z.string().max(4000).nullable(),
    executableAction: z.null(),
    requiresUserConfirmation: z.literal(true),
    transactionVersion: z.number().int().nonnegative(),
    activeOfferVersion: z.number().int().nonnegative().nullable(),
    injectionNeutralized: z.boolean(),
    usedFallbackTemplate: z.boolean(),
    copilotVersion: z.literal(NEGOTIATION_COPILOT_VERSION),
  })
  .strict();

export type RecommendBodyParsed = z.infer<typeof RecommendBodySchema>;
