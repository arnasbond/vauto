/**
 * Offline enrichment for seller phrases like „Parduodu citroena“ when Gemini JSON is thin.
 */

const SELLER_PREFIX = /\b(parduodu|parduodama|pardavimas|noriu\s+parduoti)\b/i;

const AUTO_BRANDS: { pattern: RegExp; make: string }[] = [
  { pattern: /citro[eë]n/i, make: "Citroën" },
  { pattern: /\bpeugeot\b/i, make: "Peugeot" },
  { pattern: /\bbmw\b/i, make: "BMW" },
  { pattern: /\bvolkswagen\b|\bvw\b/i, make: "Volkswagen" },
  { pattern: /\btoyota\b/i, make: "Toyota" },
  { pattern: /\bmercedes\b/i, make: "Mercedes-Benz" },
  { pattern: /\baudi\b/i, make: "Audi" },
  { pattern: /\bopel\b/i, make: "Opel" },
  { pattern: /\bford\b/i, make: "Ford" },
  { pattern: /\brenault\b/i, make: "Renault" },
  { pattern: /\bskoda\b/i, make: "Škoda" },
  { pattern: /\bvolvo\b/i, make: "Volvo" },
];

function parseTechnicalFields(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) out[k] = v.map(String);
    else out[k] = String(v);
  }
  return out;
}

function weakTitle(title: unknown): boolean {
  const t = String(title ?? "").trim().toLowerCase();
  if (!t) return true;
  return /^(skelbimas|prekė|universalus|daiktas|parduodama)/i.test(t);
}

/** Strengthen listing JSON for common LT seller voice/text patterns. */
export function enrichSellerListingFromText(
  text: string,
  raw: Record<string, unknown>
): Record<string, unknown> {
  if (!SELLER_PREFIX.test(text)) return raw;

  const enriched: Record<string, unknown> = { ...raw };
  if (!enriched.intent) enriched.intent = "sell";

  const technicalFields = parseTechnicalFields(enriched.technicalFields ?? enriched.attributes);

  for (const { pattern, make } of AUTO_BRANDS) {
    if (!pattern.test(text)) continue;
    enriched.category = "AUTOMOBILIAI";
    if (!technicalFields.make) technicalFields.make = make;
    if (weakTitle(enriched.title)) {
      enriched.title = `Parduodamas ${make} automobilis`;
    }
    enriched.technicalFields = technicalFields;
    return enriched;
  }

  if (/\b(butas|butą|namas|namą|sklypas|žemė|nt)\b/i.test(text)) {
    enriched.category = enriched.category ?? "NT";
    if (weakTitle(enriched.title)) enriched.title = "Parduodamas nekilnojamasis turtas";
  }

  enriched.technicalFields = technicalFields;
  return enriched;
}
