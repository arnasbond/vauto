import type { AiExtractedListing, Listing, ListingCategory } from "@/lib/types";

export type VisualSearchSource = "photo" | "voice";

export interface VisualSearchProfile {
  source: VisualSearchSource;
  title: string;
  category: ListingCategory;
  price: number;
  location: string;
  confidence: number;
  description?: string;
  attributes?: AiExtractedListing["attributes"];
  /** Optional preview from user upload (data: URL) */
  previewImage?: string | null;
}

export function buildVisualSearchProfile(
  extracted: AiExtractedListing,
  source: VisualSearchSource,
  previewImage?: string | null
): VisualSearchProfile {
  return {
    source,
    title: extracted.title,
    category: extracted.category,
    price: extracted.price,
    location: extracted.location,
    confidence: extracted.confidence,
    description: extracted.description,
    attributes: extracted.attributes,
    previewImage: previewImage ?? null,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?()[\]'"„“—–-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function listingHaystack(listing: Listing): string {
  return [
    listing.title,
    listing.location,
    listing.category,
    listing.description ?? "",
    ...listing.tags,
    ...Object.entries(listing.attributes ?? {}).flatMap(([key, value]) => [
      key,
      ...(Array.isArray(value) ? value : value ? [value] : []),
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

/** Client-side visual similarity from AI extraction profile (no embeddings DB) */
export function computeVisualRelevance(
  profile: VisualSearchProfile,
  listing: Listing
): number {
  let score = 0;

  if (listing.category === profile.category) score += 0.35;

  const titleTokens = tokenize(profile.title);
  const haystack = listingHaystack(listing);
  if (titleTokens.length) {
    const titleHits = titleTokens.filter((t) => haystack.includes(t)).length;
    score += (titleHits / titleTokens.length) * 0.35;
  }

  if (profile.location && listing.location) {
    const locA = profile.location.toLowerCase();
    const locB = listing.location.toLowerCase();
    if (locA === locB || locB.includes(locA) || locA.includes(locB)) {
      score += 0.15;
    }
  }

  if (profile.price > 0 && listing.price > 0) {
    const ratio = Math.min(profile.price, listing.price) / Math.max(profile.price, listing.price);
    if (ratio >= 0.7) score += 0.1;
    else if (ratio >= 0.45) score += 0.05;
  }

  const attrTokens = tokenize(
    Object.entries(profile.attributes ?? {})
      .filter(([k]) => !k.startsWith("_"))
      .flatMap(([, v]) => (Array.isArray(v) ? v : [String(v)]))
      .join(" ")
  );
  if (attrTokens.length) {
    const attrHits = attrTokens.filter((t) => haystack.includes(t)).length;
    score += (attrHits / attrTokens.length) * 0.15;
  }

  return Math.min(1, Math.max(0, score * (0.65 + profile.confidence * 0.35)));
}

export function visualSearchLabel(profile: VisualSearchProfile): string {
  const mode = profile.source === "photo" ? "nuotraukos" : "balso";
  return `Paieška pagal ${mode} aprašymą: ${profile.title}`;
}
