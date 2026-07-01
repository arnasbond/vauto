import { apiPhotoIntent } from "@/lib/api/client";
import type { ResolvedVisualSearchIntent } from "@/lib/gemini-search-intent";
import {
  listingCategoryLabel,
  type PhotoIntentAnalysis,
  type PhotoIntentPhase,
} from "@/lib/photo-intent-resolution";
import {
  PHOTO_SEARCH_FALLBACK_MESSAGE,
  runPhotoVisionSearch,
} from "@/lib/photo-vision-search";
import type { ListingCategory } from "@/lib/types";
import type { VisualPipelinePayload } from "@/lib/visual-pipeline-merge";

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

function normalizeCategory(raw: string | null | undefined): ListingCategory {
  const c = String(raw ?? "other") as ListingCategory;
  return VALID_CATEGORIES.includes(c) ? c : "other";
}

function mapServerVisionIntent(raw: Record<string, unknown>): ResolvedVisualSearchIntent {
  const cleanQuery = String(raw.cleanQuery ?? raw.visualSummary ?? "").trim() || "objektą";
  const category = normalizeCategory(
    (raw.listingCategory as string | undefined) ?? (raw.category as string | undefined)
  );
  const searchFilters = (raw.searchFilters as ResolvedVisualSearchIntent["searchFilters"]) ?? {};
  return {
    cleanQuery,
    category,
    cityNominative: raw.location ? String(raw.location) : undefined,
    radiusKm: Number(raw.radiusKm) || undefined,
    condition:
      raw.condition === "used" || raw.condition === "new" ? raw.condition : undefined,
    categoryAttributes: {},
    agentFilters: { query: cleanQuery, category },
    visualSummary: String(raw.visualSummary ?? cleanQuery),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
    objectType: String(raw.objectType ?? "other"),
    searchFilters,
    source: "gemini",
    sceneContext: raw.sceneContext ? String(raw.sceneContext) : undefined,
    choiceChips: Array.isArray(raw.choiceChips)
      ? raw.choiceChips.map(String).filter(Boolean)
      : undefined,
    semanticAlternatives: Array.isArray(raw.semanticAlternatives)
      ? raw.semanticAlternatives.map(String).filter(Boolean)
      : undefined,
    clarificationPrompt: raw.clarificationPrompt
      ? String(raw.clarificationPrompt)
      : undefined,
  };
}

function buildAnalysisFromParts(input: {
  phase: PhotoIntentPhase;
  objectLabel: string;
  category: ListingCategory;
  confidence: number;
  orderedImageUrls: string[];
  extraContext?: string;
  visualPipeline?: VisualPipelinePayload;
  visionIntent: ResolvedVisualSearchIntent;
  choiceChips?: string[];
  clarificationPrompt?: string;
}): PhotoIntentAnalysis {
  return {
    ok: true,
    phase: input.phase,
    objectLabel: input.objectLabel,
    categoryLabel: listingCategoryLabel(input.category),
    category: input.category,
    confidence: input.confidence,
    orderedImageUrls: input.orderedImageUrls,
    extraContext: input.extraContext,
    visualPipeline: input.visualPipeline,
    visionIntent: input.visionIntent,
    choiceChips: input.choiceChips,
    clarificationPrompt: input.clarificationPrompt,
  };
}

export async function analyzePhotoIntentResolution(opts: {
  photos: string[];
  extraContext?: string;
  userCity?: string;
  userName?: string;
  wardrobeOnly?: boolean;
}): Promise<PhotoIntentAnalysis | null> {
  const photos = opts.photos.filter(Boolean).slice(0, 6);
  if (!photos[0]) return null;

  const remote = await apiPhotoIntent({
    imageDataUrl: photos[0]!,
    imageDataUrls: photos.length > 1 ? photos : undefined,
    extraContext: opts.extraContext,
    userCity: opts.userCity ?? "Lietuva",
    userName: opts.userName,
    wardrobeOnly: opts.wardrobeOnly,
  });

  if (remote?.ok) {
    const category = normalizeCategory(remote.category);
    const visionIntent = remote.visionIntent
      ? mapServerVisionIntent(remote.visionIntent as Record<string, unknown>)
      : mapServerVisionIntent({
          cleanQuery: remote.objectLabel,
          visualSummary: remote.objectLabel,
          confidence: remote.confidence,
          listingCategory: remote.category,
        });

    const phase: PhotoIntentPhase =
      remote.phase === "multi_object" && (remote.choiceChips?.length ?? 0) >= 2
        ? "multi_object"
        : "intent_resolution";

    return buildAnalysisFromParts({
      phase,
      objectLabel: remote.objectLabel || visionIntent.cleanQuery || "objektą",
      category,
      confidence: remote.confidence ?? visionIntent.confidence,
      orderedImageUrls: remote.orderedImageUrls?.length ? remote.orderedImageUrls : photos,
      extraContext: opts.extraContext,
      visualPipeline: remote.visualPipeline,
      visionIntent,
      choiceChips: remote.choiceChips,
      clarificationPrompt: remote.clarificationPrompt,
    });
  }

  const vision = await runPhotoVisionSearch(photos[0]!, {
    extraContext: opts.extraContext,
    userCity: opts.userCity,
    userName: opts.userName,
    wardrobeOnly: opts.wardrobeOnly,
  });

  if (!vision || vision.confidence < 0.2) {
    throw new Error(PHOTO_SEARCH_FALLBACK_MESSAGE);
  }

  const searchChips = vision.intent.choiceChips?.filter(Boolean) ?? [];
  if (searchChips.length >= 2) {
    return buildAnalysisFromParts({
      phase: "multi_object",
      objectLabel: vision.title ?? vision.intent.cleanQuery ?? "kelis objektus",
      category: normalizeCategory(vision.category ?? vision.intent.category ?? "other"),
      confidence: vision.confidence,
      orderedImageUrls: photos,
      extraContext: opts.extraContext,
      visionIntent: vision.intent,
      choiceChips: searchChips,
      clarificationPrompt: vision.intent.clarificationPrompt,
    });
  }

  return buildAnalysisFromParts({
    phase: "intent_resolution",
    objectLabel: vision.title ?? vision.intent.cleanQuery ?? "objektą",
    category: normalizeCategory(vision.category ?? vision.intent.category ?? "other"),
    confidence: vision.confidence,
    orderedImageUrls: photos,
    extraContext: opts.extraContext,
    visionIntent: vision.intent,
  });
}
