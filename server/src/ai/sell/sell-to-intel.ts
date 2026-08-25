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

import type { ExtractedField, SellDraft } from "./sell-draft-schema.js";
import type { ListingIntelDraft, ListingIntelField } from "../../shared/listing-intelligence/index.js";
import { toIntelField } from "../../shared/intelligence-adapter/index.js";

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

  const requiresReview =
    draft.requiresUserConfirmation === true ||
    Object.values(fields).some((f) => f.requiresReview || f.conflicts.length > 0);

  return { fields, requiresReview, reviewReasons: [] };
}
