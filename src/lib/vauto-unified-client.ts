import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import { resolveListingCity } from "@/lib/city-resolve";
import {
  extractVisionChoiceChips,
} from "@/lib/vision-choice-chips";
import type { VisualPipelinePayload } from "@/lib/visual-pipeline-merge";
import { applyVisualPipelineToDraft } from "@/lib/visual-pipeline-merge";

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
  listingId?: string;
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
  isVerified?: boolean;
  requiresReview?: boolean;
  imageAlt?: string;
  imageTitle?: string;
  reviewNotice?: string;
}

export interface VautoServerParseResponse {
  ok: true;
  action: VautoServerAction;
  parsed?: Record<string, unknown>;
  listing: VautoServerListingPayload;
  visualSeo?: { alt: string; title: string; description?: string };
  antiFraud?: {
    isVerified: boolean;
    requiresReview: boolean;
    riskScore: number;
    userNotice: string;
  };
  visualPipeline?: VisualPipelinePayload;
}

export interface VautoServerUploadResponse {
  ok: true;
  action: "upload_media";
  url: string;
  publicId: string;
  listingId?: string;
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
  listing: VautoServerListingPayload,
  fallbackCity = "Vilnius",
  visualPipeline?: VisualPipelinePayload | null
): AiExtractedListing {
  const category = VALID_CATEGORIES.includes(listing.category as ListingCategory)
    ? (listing.category as ListingCategory)
    : "other";

  const attrs = { ...(listing.attributes ?? {}) };
  delete attrs._vautoCategory;

  const imageAlt =
    listing.imageAlt ?? (typeof attrs.imageAlt === "string" ? attrs.imageAlt : undefined);
  const imageTitle =
    listing.imageTitle ??
    (typeof attrs.imageTitle === "string" ? attrs.imageTitle : undefined);

  const clarificationPrompt =
    typeof attrs.clarificationPrompt === "string" ? attrs.clarificationPrompt.trim() : undefined;
  const choiceChips = extractVisionChoiceChips(
    { attributes: attrs, clarificationPrompt, choiceChips: undefined },
    "sell"
  );
  if (choiceChips.length) {
    delete attrs.choiceChips;
  }

  return applyVisualPipelineToDraft(
    {
      title: listing.title,
      price: listing.price,
      location: resolveListingCity(listing.location, fallbackCity),
      contact: listing.contact,
      category,
      description: listing.description,
      confidence: listing.confidence,
      attributes: attrs,
      isVerified: listing.isVerified ?? true,
      requiresReview: listing.requiresReview ?? false,
      reviewNotice: listing.reviewNotice,
      imageAlt,
      imageTitle,
      choiceChips: choiceChips.length ? choiceChips : undefined,
      clarificationPrompt,
    },
    visualPipeline
  );
}
