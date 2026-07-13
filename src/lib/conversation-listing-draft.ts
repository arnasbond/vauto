import type { AiExtractedListing } from "@/lib/types";

const CITY_PATTERN =
  /\b(vilni\w*|kaun\w*|klaipėd\w*|šiauli\w*|panevėž\w*|alyt\w*)\b/i;
const PRICE_PATTERN = /(\d{1,6})\s*(?:€|eur)/i;

/**
 * Strip AI-invented location/price when the user never mentioned them.
 * Keeps draft metadata in state only — never shown as form fields.
 */
export function stripHallucinatedListingDefaults(
  draft: AiExtractedListing,
  sourceText: string
): AiExtractedListing {
  const src = sourceText.trim();
  if (!src) return draft;

  const next = { ...draft };

  if (next.location?.trim()) {
    const loc = next.location.trim();
    const userMentionedCity = CITY_PATTERN.test(src);
    const locLooksDefault =
      /^(vilnius|kaunas|klaipėda|lietuva)/i.test(loc) ||
      loc.length <= 20;
    if (locLooksDefault && !userMentionedCity && !src.toLowerCase().includes(loc.toLowerCase())) {
      next.location = "";
    }
  }

  if (next.price > 0) {
    const priceInText = PRICE_PATTERN.test(src) || /\b\d{2,6}\b/.test(src);
    if (!priceInText && next.price <= 100) {
      next.price = 0;
      next.priceLabel = undefined;
    }
  }

  return next;
}
