/** Negotiation safety guards — escalation and off-topic detection. */

const PERSONAL_DATA_PATTERN =
  /\b(\+370|8\d{8}|@\w+\.\w+|asmenin(is|į)\s+duomen|banko\s+sąskait)/i;
const ABUSE_PATTERN =
  /\b(kvail|idiot|scam|apgav|melag|šūd|fuck|shit)\b/i;
const NON_PRICE_PATTERN =
  /\b(siunt|garantij|grąžin|sąskait|adres|telefon|email|pašt)/i;

export type NegotiationGuardReason =
  | "personal_data"
  | "abuse"
  | "non_price_topic"
  | "none";

export interface NegotiationGuardResult {
  escalate: boolean;
  reason: NegotiationGuardReason;
  sellerNotification?: string;
}

export function evaluateNegotiationGuards(buyerMessage: string): NegotiationGuardResult {
  const text = buyerMessage.trim();
  if (!text) {
    return { escalate: false, reason: "none" };
  }
  if (PERSONAL_DATA_PATTERN.test(text)) {
    return {
      escalate: true,
      reason: "personal_data",
      sellerNotification:
        "AI Dvynys neatsakė automatiškai — pirkėjo žinutėje aptikti asmens duomenys. Perimkite pokalbį.",
    };
  }
  if (ABUSE_PATTERN.test(text)) {
    return {
      escalate: true,
      reason: "abuse",
      sellerNotification:
        "AI Dvynys sustabdė automatinį atsakymą dėl įžeidžiančios ar įtartinos žinutės.",
    };
  }
  if (NON_PRICE_PATTERN.test(text) && !/\d+\s*€|eur/i.test(text)) {
    return {
      escalate: true,
      reason: "non_price_topic",
      sellerNotification:
        "AI Dvynys perdavė klausimą jums — tai ne kainos deryba.",
    };
  }
  return { escalate: false, reason: "none" };
}

export function applyMaxDiscountRule(opts: {
  listingPrice: number;
  minPrice: number;
  offeredPrice?: number;
  maxDiscountPercent?: number;
}): { allowed: boolean; floorPrice: number } {
  const maxPct = Math.min(50, Math.max(0, opts.maxDiscountPercent ?? 25));
  const floorFromPct = Math.round(opts.listingPrice * (1 - maxPct / 100));
  const floorPrice = Math.max(opts.minPrice, floorFromPct, 1);
  const offered = opts.offeredPrice ?? 0;
  return {
    allowed: offered <= 0 || offered >= floorPrice,
    floorPrice,
  };
}
