/**
 * Negotiable / „kainos sutartinės“ price handling for chat + PrePublish.
 */

export const NEGOTIABLE_PRICE_LABEL = "Kainos sutartinės";

const NEGOTIABLE_PRICE_RE =
  /\b(sutartin[eėaą]|kainos?\s+sutartin|derinam[ao]?|kaina\s+derin|po\s+susitarimo|negotiable|price\s+on\s+request|be\s+kainos|kainos\s+nenurod)\w*/i;

export function isNegotiablePriceChatInput(text: string | undefined | null): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (NEGOTIABLE_PRICE_RE.test(t)) return true;
  // Bare "0" / "0 €" as explicit negotiable sentinel from chips/users.
  if (/^0(?:[.,]0+)?\s*(?:€|eur|eurų|eurai)?\.?$/i.test(t)) return true;
  return false;
}

export function isNegotiableListingPrice(draft: {
  price?: number | null;
  priceLabel?: string | null;
  attributes?: Record<string, unknown> | null;
}): boolean {
  const attrs = draft.attributes ?? {};
  const flag = String(
    attrs.isNegotiable ?? attrs.priceType ?? attrs.price_type ?? ""
  )
    .trim()
    .toLowerCase();
  if (flag === "true" || flag === "1" || flag === "negotiable" || flag === "sutartine") {
    return true;
  }
  const label = String(draft.priceLabel ?? attrs.priceLabel ?? "").trim();
  if (label && NEGOTIABLE_PRICE_RE.test(label)) return true;
  return false;
}

/** True when PrePublish / publish may proceed without a numeric >0 price. */
export function draftHasSatisfiedPrice(draft: {
  price?: number | null;
  priceLabel?: string | null;
  attributes?: Record<string, unknown> | null;
}): boolean {
  if (Number(draft.price) > 0) return true;
  return isNegotiableListingPrice(draft);
}

export type NegotiablePricePatch = {
  price: 0;
  priceLabel: typeof NEGOTIABLE_PRICE_LABEL;
  attributes: {
    isNegotiable: "true";
    priceType: "negotiable";
  };
};

export function negotiablePricePatch(): NegotiablePricePatch {
  return {
    price: 0,
    priceLabel: NEGOTIABLE_PRICE_LABEL,
    attributes: {
      isNegotiable: "true",
      priceType: "negotiable",
    },
  };
}
