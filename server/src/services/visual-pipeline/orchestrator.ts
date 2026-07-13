import { logProductionWarn } from "../../lib/production-log.js";
import {
  extractBarcodesFromText,
  isValidBarcode,
  normalizeBarcode,
} from "../../product/barcode-utils.js";
import { visualPipelineFeatures } from "./features.js";
import { runBackgroundRemoval } from "./providers/background-removal.js";
import { runDamageDetection } from "./providers/damage-detection.js";
import { extractPlateToken, extractVinToken, runOcrPipeline } from "./providers/ocr.js";
import { runSmartSort } from "./providers/smart-sort.js";
import { runVisionCodeExtract } from "./providers/vision-extract.js";
import type {
  VisualPipelineImageInput,
  VisualPipelineOptions,
  VisualPipelineResult,
  VisualPipelineStageResult,
} from "./types.js";

function normalizeInputs(urls: string[]): VisualPipelineImageInput[] {
  return urls
    .map((sourceUrl, index) => ({ id: String(index), sourceUrl: sourceUrl.trim() }))
    .filter((i) => i.sourceUrl.length > 0);
}

function buildTechnicalDescription(
  ocrText: string,
  damageCondition: string,
  codes: string[]
): string {
  const parts: string[] = [];
  if (ocrText.trim()) parts.push(ocrText.trim());
  if (codes.length) parts.push(`Kodai / lipdukai: ${codes.join(", ")}`);
  if (damageCondition.trim()) parts.push(`Būklės pastaba: ${damageCondition.trim()}`);
  return parts.join("\n\n");
}

function buildAttributeHints(
  codes: string[],
  mergedText: string,
  damageCondition: string
): Record<string, string> {
  const hints: Record<string, string> = {};
  const barcodes = extractBarcodesFromText(mergedText);
  const lines = mergedText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const vin = lines.map(extractVinToken).find((v): v is string => Boolean(v));
  const plateNumber = lines
    .map(extractPlateToken)
    .find((v): v is string => Boolean(v));
  const barcode =
    barcodes[0] ??
    codes
      .map((c) => (isValidBarcode(c) ? normalizeBarcode(c) : null))
      .find((c): c is string => Boolean(c));
  if (barcode) hints.barcode = barcode;
  else if (codes[0]) hints.modelCode = codes[0];
  if (vin) hints.vin = vin;
  if (plateNumber) hints.plateNumber = plateNumber;
  if (damageCondition) hints.conditionNote = damageCondition;
  return hints;
}

/**
 * Visual AI Pipeline orchestrator.
 *
 * Eiliškumas (v1.6.17):
 *  1. Background removal (parallel per image)
 *  2. OCR + Damage detection (parallel on processed images)
 *  3. Smart sort (cover selection)
 *  4. Merge → technicalDescriptionDraft + conversationalHints
 */
export async function runVisualPipeline(
  imageUrls: string[],
  options: VisualPipelineOptions = {}
): Promise<VisualPipelineResult> {
  const started = Date.now();
  const features = visualPipelineFeatures();
  let images = normalizeInputs(imageUrls);

  const empty: VisualPipelineResult = {
    ok: false,
    durationMs: 0,
    images: [],
    coverImageId: "0",
    orderedImageUrls: [],
    attributeHints: {},
  };

  if (!images.length) return { ...empty, durationMs: Date.now() - started };

  const wantBg =
    options.removeBackground !== false && features.backgroundRemoval !== "none";
  const wantOcr = options.runOcr !== false && features.ocr !== "none";
  const wantDamage = options.detectDamage !== false && features.damageDetection;
  const wantSort = options.smartSort !== false && features.smartSort;

  let backgroundRemoval: VisualPipelineStageResult<
    import("./types.js").BackgroundRemovalResult
  > | undefined;
  let ocr: VisualPipelineStageResult<import("./types.js").OcrPipelineResult> | undefined;
  let visionExtract:
    | VisualPipelineStageResult<import("./types.js").VisionExtractResult>
    | undefined;
  let damage: VisualPipelineStageResult<import("./types.js").DamageDetectionResult> | undefined;
  let smartSort: VisualPipelineStageResult<import("./types.js").SmartSortResult> | undefined;

  // —— Stage 1: Background removal ——
  if (wantBg) {
    const t0 = Date.now();
    try {
      const data = await runBackgroundRemoval(images, features.backgroundRemoval);
      images = images.map((img) => {
        const hit = data.images.find((r) => r.id === img.id);
        return hit ? { ...img, processedUrl: hit.processedUrl } : img;
      });
      backgroundRemoval = {
        stage: "background_removal",
        ok: true,
        provider: features.backgroundRemoval,
        durationMs: Date.now() - t0,
        data,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logProductionWarn("visual-pipeline", "Background removal failed — using originals", {
        error: msg,
      });
      backgroundRemoval = {
        stage: "background_removal",
        ok: false,
        provider: features.backgroundRemoval,
        durationMs: Date.now() - t0,
        error: msg,
      };
    }
  } else {
    backgroundRemoval = {
      stage: "background_removal",
      ok: true,
      provider: "none",
      durationMs: 0,
      skipped: true,
      skipReason: "provider_not_configured",
    };
  }

  // —— Stage 2a + 2b: OCR & Damage (parallel) ——
  const parallelJobs: Promise<void>[] = [];

  if (wantOcr) {
    parallelJobs.push(
      (async () => {
        const t0 = Date.now();
        try {
          const data = await runOcrPipeline(images, features.ocr);
          ocr = {
            stage: "ocr",
            ok: true,
            provider: features.ocr,
            durationMs: Date.now() - t0,
            data,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ocr = {
            stage: "ocr",
            ok: false,
            provider: features.ocr,
            durationMs: Date.now() - t0,
            error: msg,
          };
        }
      })()
    );
  } else {
    ocr = {
      stage: "ocr",
      ok: true,
      provider: "none",
      durationMs: 0,
      skipped: true,
      skipReason: "provider_not_configured",
    };
  }

  if (wantDamage) {
    parallelJobs.push(
      (async () => {
        const t0 = Date.now();
        try {
          const data = await runDamageDetection(images, {
            category: options.category,
            title: options.listingTitle,
          });
          damage = {
            stage: "damage_detection",
            ok: true,
            provider: "gemini-vision",
            durationMs: Date.now() - t0,
            data,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          damage = {
            stage: "damage_detection",
            ok: false,
            provider: "gemini-vision",
            durationMs: Date.now() - t0,
            error: msg,
          };
        }
      })()
    );
  } else {
    damage = {
      stage: "damage_detection",
      ok: true,
      provider: "none",
      durationMs: 0,
      skipped: true,
      skipReason: "gemini_not_configured",
    };
  }

  await Promise.all(parallelJobs);

  const ocrHasSignals = Boolean(
    ocr?.data?.mergedText?.trim() || ocr?.data?.extractedCodes?.length
  );
  const wantVisionExtract =
    options.runOcr !== false && features.visionExtract && !ocrHasSignals;

  if (wantVisionExtract) {
    const t0 = Date.now();
    try {
      const data = await runVisionCodeExtract(images);
      visionExtract = {
        stage: "vision_extract",
        ok: true,
        provider: "gemini-vision",
        durationMs: Date.now() - t0,
        data,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      visionExtract = {
        stage: "vision_extract",
        ok: false,
        provider: "gemini-vision",
        durationMs: Date.now() - t0,
        error: msg,
      };
    }
  } else {
    visionExtract = {
      stage: "vision_extract",
      ok: true,
      provider: features.visionExtract ? "gemini-vision" : "none",
      durationMs: 0,
      skipped: true,
      skipReason: features.visionExtract ? "ocr_already_provided_signals" : "gemini_not_configured",
    };
  }

  // —— Stage 3: Smart sort ——
  if (wantSort) {
    const t0 = Date.now();
    try {
      const data = await runSmartSort(images, { category: options.category });
      smartSort = {
        stage: "smart_sort",
        ok: true,
        provider: "gemini-vision",
        durationMs: Date.now() - t0,
        data,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      smartSort = {
        stage: "smart_sort",
        ok: false,
        provider: "gemini-vision",
        durationMs: Date.now() - t0,
        error: msg,
      };
    }
  }

  const orderedImageUrls =
    smartSort?.data?.ordered.map((p) => p.url) ??
    images.map((i) => i.processedUrl ?? i.sourceUrl);
  const coverImageId = smartSort?.data?.coverImageId ?? images[0]?.id ?? "0";

  const ocrData = ocr?.data;
  const visionData = visionExtract?.data;
  const damageData = damage?.data;
  const mergedText = [ocrData?.mergedText, visionData?.mergedText]
    .map((text) => text?.trim())
    .filter(Boolean)
    .join("\n");
  const extractedCodes = [
    ...(ocrData?.extractedCodes ?? []),
    ...(visionData?.extractedCodes ?? []),
  ];
  const technicalDescriptionDraft = buildTechnicalDescription(
    mergedText,
    damageData?.conditionHint ?? "",
    extractedCodes
  );
  const attributeHints = buildAttributeHints(
    extractedCodes,
    mergedText,
    damageData?.conditionHint ?? ""
  );
  if (visionData?.barcode && !attributeHints.barcode) {
    attributeHints.barcode = visionData.barcode;
  }
  if (visionData?.vin && !attributeHints.vin) {
    attributeHints.vin = visionData.vin;
  }
  if (visionData?.plateNumber && !attributeHints.plateNumber) {
    attributeHints.plateNumber = visionData.plateNumber;
  }
  if (visionData?.modelCode && !attributeHints.modelCode) {
    attributeHints.modelCode = visionData.modelCode;
  }

  return {
    ok: true,
    durationMs: Date.now() - started,
    images,
    coverImageId,
    orderedImageUrls,
    backgroundRemoval,
    ocr,
    visionExtract,
    damage,
    smartSort,
    technicalDescriptionDraft: technicalDescriptionDraft || undefined,
    attributeHints,
    conversationalHints: damageData?.hasVisibleDefects
      ? {
          hasVisibleDefects: true,
          assistantPrompt: damageData.assistantPrompt,
          isDamageVerified: false,
        }
      : undefined,
  };
}
