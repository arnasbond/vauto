import type { VisualPipelineOptions, VisualPipelineResult } from "./types.js";
import { runVisualPipeline } from "./orchestrator.js";

export interface ListingFieldsForPipelineMerge {
  description?: string;
  attributes: Record<string, string | string[]>;
}

/** Run visual pipeline before Gemini listing extract. */
export async function runVisualPipelineForExtract(
  imageUrls: string[],
  options: VisualPipelineOptions = {}
): Promise<VisualPipelineResult> {
  return runVisualPipeline(imageUrls, options);
}

export function imagesAfterPipeline(
  pipeline: VisualPipelineResult,
  fallback: string[]
): string[] {
  if (pipeline.orderedImageUrls?.length) return pipeline.orderedImageUrls;
  return fallback;
}

export function mergePipelineIntoListingFields(
  listing: ListingFieldsForPipelineMerge,
  pipeline: VisualPipelineResult
): void {
  const hints = pipeline.attributeHints ?? {};
  for (const [k, v] of Object.entries(hints)) {
    if (v && !listing.attributes[k]) listing.attributes[k] = v;
  }

  if (pipeline.damage?.data?.hasVisibleDefects) {
    listing.attributes.visualDamagePending = "true";
    if (!listing.attributes.isDamageVerified) {
      listing.attributes.isDamageVerified = "false";
    }
  }

  const tech = pipeline.technicalDescriptionDraft?.trim();
  if (!tech) return;

  const desc = listing.description?.trim() ?? "";
  if (!desc) {
    listing.description = tech;
    return;
  }
  if (!desc.includes(tech.slice(0, Math.min(40, tech.length)))) {
    listing.description = `${desc}\n\n${tech}`;
  }
}

export function visualPipelineResponseSlice(pipeline: VisualPipelineResult) {
  return {
    orderedImageUrls: pipeline.orderedImageUrls,
    coverImageId: pipeline.coverImageId,
    technicalDescriptionDraft: pipeline.technicalDescriptionDraft,
    attributeHints: pipeline.attributeHints,
    conversationalHints: pipeline.conversationalHints,
    durationMs: pipeline.durationMs,
    stages: {
      backgroundRemoval: pipeline.backgroundRemoval
        ? {
            ok: pipeline.backgroundRemoval.ok,
            provider: pipeline.backgroundRemoval.provider,
            skipped: pipeline.backgroundRemoval.skipped,
          }
        : undefined,
      ocr: pipeline.ocr
        ? {
            ok: pipeline.ocr.ok,
            provider: pipeline.ocr.provider,
            skipped: pipeline.ocr.skipped,
          }
        : undefined,
      damage: pipeline.damage
        ? { ok: pipeline.damage.ok, hasVisibleDefects: pipeline.damage.data?.hasVisibleDefects }
        : undefined,
      smartSort: pipeline.smartSort
        ? { ok: pipeline.smartSort.ok, coverImageId: pipeline.coverImageId }
        : undefined,
    },
  };
}
