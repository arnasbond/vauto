/**
 * SellDraft Zod schema — every draft requires user confirmation; never auto-publish.
 */

import { z } from "zod";

export const SellFieldSourceSchema = z.enum([
  "VISION",
  "TEXT",
  "VOICE",
  "COMBINED",
  "USER_PROVIDED",
  "OCR_UNTRUSTED",
]);

export const ExtractedFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object({
      value: valueSchema.nullable(),
      confidence: z.number().min(0).max(1),
      source: SellFieldSourceSchema,
      requiresConfirmation: z.boolean(),
      evidence: z.array(z.string().max(240)).max(12).optional(),
    })
    .strict();

export type ExtractedField<T> = {
  value: T | null;
  confidence: number;
  source: z.infer<typeof SellFieldSourceSchema>;
  requiresConfirmation: boolean;
  evidence?: string[];
};

const StringField = ExtractedFieldSchema(z.string().max(500));
const NumberField = ExtractedFieldSchema(z.number().finite());
const UnknownField = ExtractedFieldSchema(z.unknown());

export const SellDraftSchema = z
  .object({
    category: StringField,
    title: StringField,
    brand: StringField.optional(),
    model: StringField.optional(),
    year: NumberField.optional(),
    condition: StringField.optional(),
    color: StringField.optional(),
    /** Only USER_PROVIDED / TEXT / VOICE explicit — never VISION pseudo-valuation. */
    price: NumberField.optional(),
    description: StringField.optional(),
    attributes: z.record(z.string().max(64), UnknownField).default({}),
    missing: z.array(z.string().max(64)).max(32),
    warnings: z.array(z.string().max(240)).max(32),
    /** Literal true — HITL hard rule. */
    requiresUserConfirmation: z.literal(true),
    /** Always false / absent for publish. */
    autoPublish: z.literal(false),
    originalText: z.string().max(4000).optional(),
    originalTranscript: z.string().max(4000).optional(),
    normalizedText: z.string().max(4000).optional(),
    imageSafety: z
      .object({
        safe: z.boolean(),
        requiresReview: z.boolean(),
        reasons: z.array(z.string().max(120)).max(16),
      })
      .optional(),
    /**
     * 10D Market Intelligence advisory — never overwrites user price.
     * Present only when market observations were supplied to the sell pipeline.
     */
    marketAdvice: z
      .object({
        userPrice: z.number().finite().nullable(),
        estimatedRange: z
          .object({
            low: z.number().finite().nonnegative(),
            median: z.number().finite().nonnegative(),
            high: z.number().finite().nonnegative(),
          })
          .nullable(),
        recommendation: z.string().max(500),
        overwriteUserPrice: z.literal(false),
        askingPriceVsMarket: z.enum([
          "BELOW_RANGE",
          "WITHIN_RANGE",
          "ABOVE_RANGE",
          "UNKNOWN",
        ]),
      })
      .strict()
      .optional(),
    foundationVersion: z.string().max(16),
  })
  .strict();

export type SellDraft = z.infer<typeof SellDraftSchema>;

export function parseSellDraft(raw: unknown): SellDraft {
  return SellDraftSchema.parse(raw);
}

export function field<T>(
  value: T | null,
  confidence: number,
  source: ExtractedField<T>["source"],
  opts?: { requiresConfirmation?: boolean; evidence?: string[] }
): ExtractedField<T> {
  const requiresConfirmation =
    opts?.requiresConfirmation ?? (value == null || confidence < 0.9);
  return {
    value,
    confidence,
    source,
    requiresConfirmation,
    evidence: opts?.evidence,
  };
}
