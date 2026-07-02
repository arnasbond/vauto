import type { AiExtractedListing } from "@/lib/types";

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

  return {
    ...draft,
    description: description || draft.description,
    attributes: attrs,
    orderedImageUrls: pipeline.orderedImageUrls?.length
      ? pipeline.orderedImageUrls
      : draft.orderedImageUrls,
    coverImageId: pipeline.coverImageId ?? draft.coverImageId,
    conversationalHints: pipeline.conversationalHints ?? draft.conversationalHints,
  };
}

export function resolveSellerGalleryImages(
  pipeline: VisualPipelinePayload | null | undefined,
  fallback: string[]
): string[] {
  if (pipeline?.orderedImageUrls?.length) return pipeline.orderedImageUrls;
  return fallback;
}
