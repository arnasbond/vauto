import type { AiExtractedListing } from "@/lib/types";
import { formatPrice } from "@/data/mockListings";

const CATEGORY_LABELS: Record<string, string> = {
  vehicles: "auto dalys / transportas",
  electronics: "elektronika",
  services: "paslaugos",
  jobs: "darbas",
  home: "namai",
  clothing: "drabužiai",
  real_estate: "nekilnojamas turtas",
  other: "prekė",
};

function safeToken(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || s === "undefined" || s === "null") return null;
  return s;
}

function attributeTokens(attributes: AiExtractedListing["attributes"]): string[] {
  if (!attributes) return [];
  const tokens: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("_")) continue;
    const keyToken = safeToken(key);
    if (keyToken) tokens.push(keyToken);
    if (Array.isArray(value)) {
      for (const item of value) {
        const t = safeToken(item);
        if (t) tokens.push(t);
      }
    } else {
      const t = safeToken(value);
      if (t) tokens.push(t);
    }
  }
  return tokens;
}

function fallbackTitle(result: AiExtractedListing): string {
  const title = safeToken(result.title);
  if (title) return title;
  return CATEGORY_LABELS[result.category] ?? "prekė";
}

export function buildPhotoSearchQuery(result: AiExtractedListing): string {
  const tokens = [
    fallbackTitle(result),
    result.category,
    CATEGORY_LABELS[result.category],
    safeToken(result.location),
    ...attributeTokens(result.attributes),
  ]
    .filter((t): t is string => Boolean(t))
    .join(" ")
    .toLowerCase()
    .split(/[\s,.;:!?()[\]'"„“—–-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token !== "undefined");

  return [...new Set(tokens)].slice(0, 8).join(" ");
}

export function buildPhotoSearchToast(result: AiExtractedListing): string {
  if (result.confidence < 0.4) {
    return `Nepavyko tiksliai atpažinti. Patikslinkite paiešką ranka arba bandykite dar kartą.`;
  }
  const price =
    result.price > 0
      ? `, rinkos kaina apie ${formatPrice(result.price, result.priceLabel)}`
      : "";
  return `Atpažinau: ${fallbackTitle(result)}${price}. Ieškau panašių skelbimų.`;
}
