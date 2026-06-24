import type { AiExtractedListing } from "@/lib/types";
import { detectSellerListingIntent } from "@/lib/scoring";

export function isSellIntent(
  text: string,
  extracted?: Pick<AiExtractedListing, "attributes"> | null
): boolean {
  if (detectSellerListingIntent(text)) return true;
  const intent = String(extracted?.attributes?._intent ?? "").toLowerCase();
  return intent === "sell" || intent === "service";
}

export function isSearchIntent(
  text: string,
  extracted?: Pick<AiExtractedListing, "attributes"> | null
): boolean {
  if (isSellIntent(text, extracted)) return false;
  const intent = String(extracted?.attributes?._intent ?? "").toLowerCase();
  if (intent === "search") return true;
  return /\bieškau\b|\bsurask\b|\bnoriu\s+pirkti\b|\brask\b/i.test(text);
}
