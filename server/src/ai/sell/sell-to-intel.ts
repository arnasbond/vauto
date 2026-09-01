/**
 * Server-side sell → canonical intel adapter (AI Maturity — Phase B).
 *
 * Derives the canonical ListingIntelDraft from the merged SellDraft fields
 * WITHOUT replacing the legacy SellDraft shape. Every merged ExtractedField
 * carries a real `source` (VISION/TEXT/VOICE/USER_PROVIDED/OCR_UNTRUSTED),
 * which is mapped to the certified canonical provenance. Confidence is
 * normalized to the [0,1] invariant; invalid values become null (UNKNOWN).
 *
 * Safety properties (tested):
 * - VISION / DOCUMENT / AI_INFERRED never become HUMAN_CONFIRMED here.
 * - USER_PROVIDED → USER_ENTERED + HUMAN_CONFIRMED (manual authoritative entry).
 * - The derived draft is advisory — it never carries publish authority and is
 *   never used to bypass the literal requiresUserConfirmation / autoPublish
 *   gates on the legacy SellDraft.
 */

import type {
  ExtractedField,
  SellDraft,
  SellFactEvidenceProjection,
} from "./sell-draft-schema.js";
import type { ListingIntelDraft, ListingIntelField, ListingIntelSource, ListingIntelConflict } from "../../shared/listing-intelligence/index.js";
import { toIntelField } from "../../shared/intelligence-adapter/index.js";
import type { FactEvidenceSource } from "../../shared/fact-evidence.js";

function toCanonicalField<T>(
  field: ExtractedField<T> | undefined
): ListingIntelField<T> | undefined {
  if (!field) return undefined;
  return toIntelField({
    value: field.value,
    confidence: field.confidence,
    source: field.source,
    requiresConfirmation: field.requiresConfirmation,
    evidence: field.evidence,
  });
}

function attrsToCanonical(
  attributes: Record<string, ExtractedField<unknown>>
): Record<string, ListingIntelField<unknown>> {
  const out: Record<string, ListingIntelField<unknown>> = {};
  for (const [key, field] of Object.entries(attributes)) {
    const canonical = toCanonicalField(field);
    if (canonical) out[`attributes.${key}`] = canonical;
  }
  return out;
}

/**
 * F2.2 — map a canonical FactEvidenceSource into the intel provenance
 * vocabulary. TRUSTED_VERIFICATION and any unknown source fall through to
 * UNKNOWN (fail-closed): this stage can never mint trusted verification, so it
 * must never fabricate a provenance for one. Category-neutral.
 */
function factSourceToIntelSource(source: FactEvidenceSource): ListingIntelSource {
  switch (source) {
    case "USER_CLAIM":
    case "USER_CORRECTION":
      return "USER_TEXT";
    case "DOCUMENT_OBSERVATION":
      return "DOCUMENT";
    case "VISUAL_OBSERVATION":
      return "VISION";
    case "MODEL_INFERENCE":
      return "AI_INFERRED";
    case "EXISTING_PERSISTED_VALUE":
      return "CONTEXT";
    case "TRUSTED_VERIFICATION":
      return "UNKNOWN";
  }
}

/**
 * F2.2 — overlay the structured fact-evidence projection onto a legacy intel
 * field. The legacy provenance/value mapping is preserved; the structured
 * state ADDS what the legacy shape could not carry: the explicit conflict,
 * the review signal, and the competing evidence.
 *
 * - Conflict candidates carry REAL typed values: the canonical candidate is
 *   the legacy field's typed `value`; the competing candidate is the original
 *   typed `conflictOriginalValue`. Normalized comparison tokens
 *   (`number:…`, `reference:…`) never reach this layer.
 * - Object-like / unsupported original values fail closed: the competing
 *   candidate is `null` and review is forced — never an invented typed value.
 * - Verification is NEVER conflated with human confirmation: this path has no
 *   INDEPENDENTLY_VERIFIED handling (the projection schema rejects it).
 */
function applyStructuredEvidence(
  fieldKey: string,
  intel: ListingIntelField<unknown>,
  projection: SellFactEvidenceProjection
): ListingIntelField<unknown> {
  const canonical =
    projection.state.validity === "VALID" ? projection.state.canonical : null;
  const stateInvalid = projection.state.validity === "INVALID";
  const conflictWith = projection.conflictWith;

  const conflicts: ListingIntelConflict<unknown>[] = [...intel.conflicts];
  if (canonical && conflictWith) {
    const competingOriginal = projection.conflictOriginalValue;
    const competingValue =
      competingOriginal !== undefined ? competingOriginal : null;
    conflicts.push({
      fieldKey,
      candidates: [
        {
          value: intel.value,
          source: intel.provenance,
          confidence: intel.confidence,
        },
        {
          value: competingValue,
          source: factSourceToIntelSource(conflictWith.source),
          confidence: null,
        },
      ],
      message: `Konfliktas lauke „${fieldKey}”: ${String(intel.value)} vs ${String(competingValue ?? "nežinoma reikšmė")} — patvirtinkite.`,
    });
  }

  const needsReview =
    intel.requiresReview ||
    projection.reviewRequired ||
    stateInvalid ||
    projection.lastDecision === "CONFLICT" ||
    conflicts.length > intel.conflicts.length;

  const conflictAdded = conflicts.length > intel.conflicts.length;
  const reviewForcedByStructuredState =
    conflictAdded || stateInvalid || projection.lastDecision === "CONFLICT";

  let reviewState = intel.reviewState;
  if (reviewForcedByStructuredState && reviewState !== "HUMAN_CONFIRMED") {
    reviewState = "NEEDS_REVIEW";
  }

  return {
    ...intel,
    requiresReview: needsReview,
    conflicts,
    reviewState,
  };
}

/**
 * Build the canonical intelligence draft from a validated SellDraft.
 * Pure derivation — does not publish, does not mutate the SellDraft.
 */
export function sellDraftToIntelDraft(draft: SellDraft): ListingIntelDraft {
  const fields: Record<string, ListingIntelField<unknown>> = {};

  const category = toCanonicalField(draft.category);
  if (category) fields.category = category;
  const title = toCanonicalField(draft.title);
  if (title) fields.title = title;
  const brand = toCanonicalField(draft.brand);
  if (brand) fields.brand = brand;
  const model = toCanonicalField(draft.model);
  if (model) fields.model = model;
  const year = toCanonicalField(draft.year);
  if (year) fields.year = year;
  const condition = toCanonicalField(draft.condition);
  if (condition) fields.condition = condition;
  const color = toCanonicalField(draft.color);
  if (color) fields.color = color;
  const price = toCanonicalField(draft.price);
  if (price) fields.price = price;
  const description = toCanonicalField(draft.description);
  if (description) fields.description = description;

  Object.assign(
    fields,
    attrsToCanonical(draft.attributes as Record<string, ExtractedField<unknown>>)
  );

  // F2.2 — structured projections keyed by the same field keys.
  for (const [fieldKey, projection] of Object.entries(draft.factEvidence ?? {})) {
    const existing = fields[fieldKey];
    if (!existing) continue;
    fields[fieldKey] = applyStructuredEvidence(fieldKey, existing, projection);
  }

  const requiresReview =
    draft.requiresUserConfirmation === true ||
    Object.values(fields).some((f) => f.requiresReview || f.conflicts.length > 0);

  return { fields, requiresReview, reviewReasons: [] };
}
