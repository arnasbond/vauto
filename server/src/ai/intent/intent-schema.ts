/**
 * VAUTO Intent Engine 10A — Zod schemas + TypeScript contracts.
 * LLM JSON is NEVER trusted without parseIntentLlmPayload / IntentResultSchema.
 */

import { z } from "zod";

export const VAUTO_INTENTS = [
  "SELL",
  "BUY",
  "SEARCH",
  "VALUE",
  "COMPARE",
  "WATCH",
  "HELP",
  "UNKNOWN",
] as const;

export type VautoIntent = (typeof VAUTO_INTENTS)[number];

export const IntentEntitiesSchema = z
  .object({
    category: z
      .enum([
        "vehicles",
        "electronics",
        "home",
        "clothing",
        "services",
        "realty",
        "jobs",
        "other",
      ])
      .nullable()
      .optional(),
    query: z.string().max(240).nullable().optional(),
    make: z.string().max(80).nullable().optional(),
    model: z.string().max(80).nullable().optional(),
    brand: z.string().max(80).nullable().optional(),
    location: z.string().max(80).nullable().optional(),
    condition: z.enum(["new", "used"]).nullable().optional(),
    transmission: z.enum(["automatic", "manual"]).nullable().optional(),
    fuel: z
      .enum(["diesel", "petrol", "electric", "hybrid", "lpg"])
      .nullable()
      .optional(),
    drivetrain: z.enum(["AWD", "FWD", "RWD", "4WD"]).nullable().optional(),
    drivetrainContext: z.string().max(40).nullable().optional(),
    priceMin: z.number().finite().nullable().optional(),
    priceMax: z.number().finite().nullable().optional(),
    yearMin: z.number().int().nullable().optional(),
    yearMax: z.number().int().nullable().optional(),
    radiusKm: z.number().finite().nullable().optional(),
    commerceFlags: z.array(z.enum(["vat_invoice"])).optional(),
  })
  .strict();

export type IntentEntities = z.infer<typeof IntentEntitiesSchema>;

export const IntentResultSchema = z
  .object({
    intent: z.enum(VAUTO_INTENTS),
    confidence: z.number().min(0).max(1),
    entities: IntentEntitiesSchema,
    missing: z.array(z.string().max(64)).max(32),
    requiresConfirmation: z.boolean(),
    abstained: z.boolean(),
    reasonCode: z.string().max(80).optional(),
    /** Always preserved separately from normalized entity fields. */
    originalText: z.string().max(4000),
    /** Domain-normalized working text (slang mapped); never replaces originalText. */
    normalizedText: z.string().max(4000),
    foundationVersion: z.string().max(16),
    modelRoute: z
      .object({
        taskClass: z.literal("FAST"),
        provider: z.string().max(40),
        model: z.string().max(120),
        fallbackUsed: z.boolean(),
      })
      .optional(),
  })
  .strict();

export type IntentResult = z.infer<typeof IntentResultSchema>;

/** Raw LLM payload before policy merge — still Zod-validated. */
export const IntentLlmPayloadSchema = z
  .object({
    intent: z.enum(VAUTO_INTENTS),
    confidence: z.number().min(0).max(1),
    entities: IntentEntitiesSchema.default({}),
    missing: z.array(z.string()).default([]),
    reasonCode: z.string().max(80).optional(),
  })
  .strict();

export type IntentLlmPayload = z.infer<typeof IntentLlmPayloadSchema>;

export function parseIntentLlmPayload(raw: unknown): IntentLlmPayload {
  return IntentLlmPayloadSchema.parse(raw);
}

export function parseIntentResult(raw: unknown): IntentResult {
  return IntentResultSchema.parse(raw);
}

/** Numeric bounds applied after extraction (never trust unbounded LLM numbers). */
export const INTENT_BOUNDS = {
  priceMin: 0,
  priceMax: 10_000_000,
  yearMin: 1950,
  yearMax: new Date().getFullYear() + 1,
  radiusKmMin: 1,
  radiusKmMax: 500,
} as const;

export function boundIntentEntities(entities: IntentEntities): IntentEntities {
  const clamp = (n: number | null | undefined, lo: number, hi: number) => {
    if (n == null || !Number.isFinite(n)) return null;
    return Math.min(hi, Math.max(lo, n));
  };

  return {
    ...entities,
    priceMin: clamp(entities.priceMin ?? null, INTENT_BOUNDS.priceMin, INTENT_BOUNDS.priceMax),
    priceMax: clamp(entities.priceMax ?? null, INTENT_BOUNDS.priceMin, INTENT_BOUNDS.priceMax),
    yearMin: clamp(entities.yearMin ?? null, INTENT_BOUNDS.yearMin, INTENT_BOUNDS.yearMax),
    yearMax: clamp(entities.yearMax ?? null, INTENT_BOUNDS.yearMin, INTENT_BOUNDS.yearMax),
    radiusKm: clamp(
      entities.radiusKm ?? null,
      INTENT_BOUNDS.radiusKmMin,
      INTENT_BOUNDS.radiusKmMax
    ),
  };
}
