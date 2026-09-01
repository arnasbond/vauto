/**
 * SellDraft Zod schema — every draft requires user confirmation; never auto-publish.
 */

import { z } from "zod";
import {
  FACT_DECISIONS,
  FACT_EVIDENCE_SOURCES,
  FACT_EVIDENCE_STATUSES,
  type FactDecision,
  type FactEvidence,
  type FactEvidenceSource,
  type FactEvidenceState,
  type FactEvidenceStatus,
} from "../../shared/fact-evidence.js";

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

/* -------------------------------------------------------------------------- */
/* F2.2 — structured fact-evidence projection (fail-closed validation)        */
/* -------------------------------------------------------------------------- */

/**
 * One structured per-field projection carried from `mergeFieldCandidates`
 * through `buildSellDraft` (validated by SellDraftSchema) into
 * `sellDraftToIntelDraft`. Reuses the F2.1 canonical model — no third model.
 * Category-neutral: no vertical or VIN knowledge anywhere in this layer.
 *
 * F2.2 boundary: TRUSTED_VERIFICATION / INDEPENDENTLY_VERIFIED are REJECTED in
 * this path — there is no authenticated server-side verification boundary
 * here, so a source/status pair can never mint verification authority.
 */
export type SellFactEvidenceProjection = {
  state: FactEvidenceState;
  lastDecision: FactDecision;
  conflictWith?: FactEvidence;
  /**
   * The original TYPED competing value (before fact-evidence normalization),
   * carried separately from the normalized comparison key. STRICT boundary:
   * bounded string, finite number or boolean only — objects, arrays, null,
   * NaN, ±Infinity and any other type are rejected (fail-closed).
   */
  conflictOriginalValue?: string | number | boolean;
  reviewRequired: boolean;
};

const FactEvidenceSourceSchema = z.enum(
  FACT_EVIDENCE_SOURCES as unknown as [FactEvidenceSource, ...FactEvidenceSource[]]
);
const FactEvidenceStatusSchema = z.enum(
  FACT_EVIDENCE_STATUSES as unknown as [FactEvidenceStatus, ...FactEvidenceStatus[]]
);
const FactDecisionSchema = z.enum(
  FACT_DECISIONS as unknown as [FactDecision, ...FactDecision[]]
);

/**
 * Structural evidence record — mirrors the contract's shape rules fail-closed:
 * unknown source/status variants are rejected; only TRUSTED_VERIFICATION may
 * carry INDEPENDENTLY_VERIFIED; and THIS projection path rejects trusted
 * verification entirely (no authenticated boundary exists here). Values and
 * reasons are strictly bounded.
 */
const FactEvidenceRecordSchema = z
  .object({
    value: z.string().min(1).max(500),
    source: FactEvidenceSourceSchema,
    status: FactEvidenceStatusSchema,
    reason: z.string().max(240).optional(),
    at: z.number().finite().optional(),
  })
  .strict()
  .refine(
    (e) =>
      (e.source === "TRUSTED_VERIFICATION") ===
      (e.status === "INDEPENDENTLY_VERIFIED"),
    {
      message:
        "tik TRUSTED_VERIFICATION šaltinis gali turėti INDEPENDENTLY_VERIFIED statusą",
    }
  )
  .superRefine((e, ctx) => {
    if (e.source === "TRUSTED_VERIFICATION" || e.status === "INDEPENDENTLY_VERIFIED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "TRUSTED_VERIFICATION / INDEPENDENTLY_VERIFIED šiame projection kelyje neleidžiami (nėra autentifikuotos server-side ribos)",
      });
    }
  });

/**
 * Cumulative evidence state with the contract's closure rules enforced at the
 * schema boundary: malformed states are REJECTED (never silently repaired);
 * a VALID state with a null canonical and canonical-capable history is
 * rejected; the canonical must be represented in the history.
 */
const FactEvidenceStateSchema = z
  .discriminatedUnion("validity", [
    z
      .object({
        validity: z.literal("VALID"),
        canonical: FactEvidenceRecordSchema.nullable(),
        history: z.array(FactEvidenceRecordSchema).max(24),
      })
      .strict(),
    z
      .object({
        validity: z.literal("INVALID"),
        canonical: z.literal(null),
        history: z.array(FactEvidenceRecordSchema).max(24),
        error: z.string().min(1).max(240),
      })
      .strict(),
  ])
  .superRefine((state, ctx) => {
    if (state.validity !== "VALID") return;
    const { canonical, history } = state;
    const canonicalCapable = history.some(
      (h) =>
        h.source === "USER_CLAIM" ||
        h.source === "USER_CORRECTION" ||
        h.source === "DOCUMENT_OBSERVATION" ||
        h.source === "VISUAL_OBSERVATION" ||
        h.source === "EXISTING_PERSISTED_VALUE" ||
        h.source === "TRUSTED_VERIFICATION"
    );
    if (canonical === null && canonicalCapable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "VALID būsena su canonical null negali turėti canonical-capable istorijos",
      });
      return;
    }
    if (
      canonical !== null &&
      !history.some(
        (h) => h.value === canonical.value && h.source === canonical.source
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "canonical nėra atstovaujamas istorijoje",
      });
    }
  });

export const FactEvidenceProjectionSchema = z
  .object({
    state: FactEvidenceStateSchema,
    lastDecision: FactDecisionSchema,
    conflictWith: FactEvidenceRecordSchema.optional(),
    conflictOriginalValue: z
      .union([z.string().max(500), z.number().finite(), z.boolean()])
      .optional(),
    reviewRequired: z.boolean(),
  })
  .strict()
  .superRefine((projection, ctx) => {
    // F2.2 — ACCEPT_VERIFICATION can only follow an authenticated trusted
    // verification boundary; this path has none, so the decision is rejected.
    if (projection.lastDecision === "ACCEPT_VERIFICATION") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ACCEPT_VERIFICATION šiame projection kelyje neleidžiamas (nėra autentifikuotos trusted-verification ribos)",
      });
    }
  });

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
    /**
     * F2.2 — structured fact-evidence projections per merged field key
     * (top-level fields by name, attributes as `attributes.<key>`).
     * Bounded: ≤64 fields (enforced below), ≤24 history records per field.
     * Optional — legacy drafts without it remain fully compatible.
     */
    factEvidence: z
      .record(z.string().max(64), FactEvidenceProjectionSchema)
      .optional(),
    foundationVersion: z.string().max(16),
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (draft.factEvidence && Object.keys(draft.factEvidence).length > 64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "factEvidence negali turėti daugiau nei 64 laukų",
      });
    }
  });

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
