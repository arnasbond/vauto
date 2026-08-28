import type { AiExtractedListing } from "@/lib/types";
import {
  orderPublicListingGallery,
  parseExcludedGalleryImageUrls,
  parseListingPhotoClassifications,
} from "@vauto/shared/listing-gallery-order";

export interface VisualPipelineConversationalHints {
  hasVisibleDefects: boolean;
  assistantPrompt?: string;
  isDamageVerified?: boolean;
}

export interface VisualPipelinePayload {
  orderedImageUrls?: string[];
  coverImageId?: string;
  technicalDescriptionDraft?: string;
  attributeHints?: Record<string, string>;
  conversationalHints?: VisualPipelineConversationalHints;
}

/** Apply server visual-pipeline output onto an extracted draft. */
export function applyVisualPipelineToDraft(
  draft: AiExtractedListing,
  pipeline?: VisualPipelinePayload | null
): AiExtractedListing {
  if (!pipeline) return draft;

  const attrs = { ...(draft.attributes ?? {}) };
  let description = draft.description?.trim() ?? "";

  const tech = pipeline.technicalDescriptionDraft?.trim();
  if (tech) {
    if (!description) {
      description = tech;
    } else if (!description.includes(tech.slice(0, Math.min(40, tech.length)))) {
      description = `${description}\n\n${tech}`;
    }
  }

  if (pipeline.conversationalHints?.hasVisibleDefects) {
    attrs.visualDamagePending = "true";
    attrs.isDamageVerified = pipeline.conversationalHints.isDamageVerified ? "true" : "false";
  }

  const hints = pipeline.attributeHints ?? {};
  if (hints.barcode && !attrs.barcode) attrs.barcode = hints.barcode;
  if (hints.vin && !attrs.vin) attrs.vin = hints.vin;
  if (hints.plateNumber && !attrs.plateNumber) attrs.plateNumber = hints.plateNumber;
  if (hints.modelCode && !attrs.modelCode) attrs.modelCode = hints.modelCode;

  const orderedImageUrls = resolveSellerGalleryImages(pipeline, draft.orderedImageUrls ?? [], {
    attributes: attrs,
  });

  return {
    ...draft,
    description: description || draft.description,
    attributes: attrs,
    orderedImageUrls: orderedImageUrls.length ? orderedImageUrls : draft.orderedImageUrls,
    coverImageId: pipeline.coverImageId ?? draft.coverImageId,
    conversationalHints: pipeline.conversationalHints ?? draft.conversationalHints,
  };
}

/**
 * Public listing gallery: prefer Vision-ordered URLs; never reintroduce tech-pasas;
 * ensure images[0] is best exterior when photoRoles are present.
 */
export function resolveSellerGalleryImages(
  pipeline: VisualPipelinePayload | null | undefined,
  fallback: string[],
  opts?: { attributes?: Record<string, string | string[] | undefined> | null }
): string[] {
  const attrs = opts?.attributes ?? {};
  const classifications = parseListingPhotoClassifications(attrs.photoRoles);
  const excluded = parseExcludedGalleryImageUrls(attrs.excludedGalleryImageUrls);
  const preferred = (pipeline?.orderedImageUrls?.length
    ? pipeline.orderedImageUrls
    : fallback
  )
    .map((u) => String(u ?? "").trim())
    .filter(Boolean);

  if (!preferred.length) return [];

  if (classifications.length || excluded.length) {
    return orderPublicListingGallery(preferred, classifications, {
      excludedUrls: excluded,
    });
  }

  return preferred
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 6);
}

/** Merge draft + extras into a public gallery (docs excluded, cover-first). */
export function mergePublicListingGallery(input: {
  preferredOrdered?: string[] | null;
  extras?: string[] | null;
  attributes?: Record<string, string | string[] | undefined> | null;
}): string[] {
  const attrs = input.attributes ?? {};
  const classifications = parseListingPhotoClassifications(attrs.photoRoles);
  const excluded = parseExcludedGalleryImageUrls(attrs.excludedGalleryImageUrls);
  const preferred = (input.preferredOrdered ?? [])
    .map((u) => String(u ?? "").trim())
    .filter(Boolean);
  const extras = (input.extras ?? [])
    .map((u) => String(u ?? "").trim())
    .filter(Boolean)
    .filter((u) => !excluded.includes(u));

  // Vision-ordered preferred list wins; only append new extras not already present.
  const merged = [
    ...preferred,
    ...extras.filter((u) => !preferred.includes(u)),
  ];

  return orderPublicListingGallery(merged, classifications, {
    excludedUrls: excluded,
  });
}
