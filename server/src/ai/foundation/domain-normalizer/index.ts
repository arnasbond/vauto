import { normalizeAutomotiveText } from "./automotive.js";
import { isVatInvoiceCue, normalizeCommerceText } from "./commerce.js";
import { normalizeLocationText } from "./locations.js";
import type { DomainNormalizeResult, NormalizedAttribute } from "./types.js";

export type { DomainNormalizeResult, NormalizedAttribute } from "./types.js";
export { normalizeAutomotiveText } from "./automotive.js";
export { normalizeCommerceText, isVatInvoiceCue } from "./commerce.js";
export { normalizeLocationText } from "./locations.js";

/**
 * Run commerce first (so "PVM sąskaita" is never treated as a car attribute),
 * then automotive + locations. Always preserves originalText.
 */
export function normalizeLithuanianDomainText(
  text: string
): DomainNormalizeResult {
  const originalText = String(text ?? "");
  const commerce = normalizeCommerceText(originalText);
  const automotive = normalizeAutomotiveText(originalText);
  const locations = normalizeLocationText(originalText);

  // If VAT invoice cue present, strip any accidental automotive attrs that
  // might collide on the same token span (defensive — current rules don't collide).
  let autoAttrs = automotive.attributes;
  if (isVatInvoiceCue(originalText)) {
    autoAttrs = autoAttrs.filter((a) => a.kind !== "commerce");
  }

  const attributes: NormalizedAttribute[] = [
    ...commerce.attributes,
    ...autoAttrs,
    ...locations.attributes,
  ];

  return {
    originalText,
    attributes,
    unresolved: [],
  };
}
