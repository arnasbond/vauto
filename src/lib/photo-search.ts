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

function attributeTokens(attributes: AiExtractedListing["attributes"]): string[] {
  if (!attributes) return [];
  const tokens: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("_")) continue;
    tokens.push(key);
    if (Array.isArray(value)) tokens.push(...value);
    else if (value) tokens.push(value);
  }
  return tokens;
}

export function buildPhotoSearchQuery(result: AiExtractedListing): string {
  const tokens = [
    result.title,
    result.category,
    CATEGORY_LABELS[result.category],
    result.location,
    ...attributeTokens(result.attributes),
  ]
    .join(" ")
    .toLowerCase()
    .split(/[\s,.;:!?()[\]'"„“—–-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return [...new Set(tokens)].slice(0, 8).join(" ");
}

export function buildPhotoSearchToast(result: AiExtractedListing): string {
  const price =
    result.price > 0
      ? `, rinkos kaina apie ${formatPrice(result.price, result.priceLabel)}`
      : "";
  return `Atpažinau: ${result.title}${price}. Ieškau panašių skelbimų.`;
}
