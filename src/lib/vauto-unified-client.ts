import type { AiExtractedListing, ListingCategory } from "@/lib/types";

export type VautoServerAction =
  | "parse_text"
  | "analyze_image"
  | "parse_combined"
  | "upload_media";

export interface VautoServerRequest {
  action: VautoServerAction;
  text?: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  extraContext?: string;
  userCity?: string;
  contact?: string;
}

export interface VautoServerListingPayload {
  title: string;
  price: number;
  location: string;
  contact: string;
  category: string;
  description?: string;
  confidence: number;
  attributes: Record<string, string | string[]>;
  intent?: string;
}

export interface VautoServerParseResponse {
  ok: true;
  action: VautoServerAction;
  parsed?: Record<string, unknown>;
  listing: VautoServerListingPayload;
}

export interface VautoServerUploadResponse {
  ok: true;
  action: "upload_media";
  url: string;
  publicId: string;
}

const VALID_CATEGORIES: ListingCategory[] = [
  "electronics",
  "vehicles",
  "services",
  "jobs",
  "home",
  "clothing",
  "real_estate",
  "other",
];

/** Map unified server listing → existing AiExtractedListing for confirmation UI */
export function mapVautoServerListing(
  listing: VautoServerListingPayload
): AiExtractedListing {
  const category = VALID_CATEGORIES.includes(listing.category as ListingCategory)
    ? (listing.category as ListingCategory)
    : "other";

  const attrs = { ...(listing.attributes ?? {}) };
  delete attrs._intent;
  delete attrs._vautoCategory;

  return {
    title: listing.title,
    price: listing.price,
    location: listing.location,
    contact: listing.contact,
    category,
    description: listing.description,
    confidence: listing.confidence,
    attributes: attrs,
  };
}
