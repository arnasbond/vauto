import type { DomainNormalizeResult, NormalizedAttribute } from "./types.js";

/**
 * Commerce / tax phrases that must NOT be misread as automotive specs.
 * Example: "PVM sąskaita" / "PVM sąskaitos" → vat_invoice commerce attribute.
 */
const VAT_INVOICE =
  /\bpvm\s*s[ąa]skait(?:a|os|ą|ai|oms|oje|oms)?(?:-?fakt[uū]ra)?\b|\bs[ąa]skait(?:a|os|ą)\s*fakt[uū]ra\s*su\s*pvm\b/iu;

export function normalizeCommerceText(text: string): DomainNormalizeResult {
  const originalText = String(text ?? "");
  const attributes: NormalizedAttribute[] = [];

  const m = VAT_INVOICE.exec(originalText);
  if (m) {
    attributes.push({
      kind: "commerce",
      value: "vat_invoice",
      originalText: m[0]!,
    });
  }

  return {
    originalText,
    attributes,
    unresolved: [],
  };
}

/** True when text looks like a tax/business invoice cue (not a car tech param). */
export function isVatInvoiceCue(text: string): boolean {
  return VAT_INVOICE.test(String(text ?? ""));
}
