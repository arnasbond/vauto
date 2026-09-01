/**
 * Visual + Voice Sell Engine (Etapas 10C).
 *
 * PHOTO / TEXT / VOICE → EXTRACTION → NORMALIZATION → CONFIDENCE → DRAFT → USER CONFIRMATION
 * - 0 auto-publish
 * - 0 pseudo-valuation (price only USER_PROVIDED)
 * - OCR is untrusted (never a command)
 * - Image safety fail-closed
 */

import {
  AI_FOUNDATION_VERSION,
  getAiModel,
  recordAiTelemetry,
} from "../foundation/index.js";
import {
  adviseSellDraftPrice,
  computeValuation,
  type MarketCategory,
  type MarketObservation,
} from "../../market-intelligence/index.js";
import {
  mergeFieldCandidates,
  mergePriceField,
  type FieldCandidate,
  type MergeFieldEvidenceProjection,
  type MergeFieldCandidatesOptions,
  type MergeResult,
} from "./field-merge.js";
import { validateImagesFailClosed, type ImageSafetyResult, type ImageSafetyProvider } from "./image-validation.js";
import {
  parseSellDraft,
  type ExtractedField,
  type SellDraft,
  type SellFactEvidenceProjection,
} from "./sell-draft-schema.js";
import { SELL_AUTO_PUBLISH, type SellInput } from "./sell-types.js";
import { extractFromUserText } from "./text-extract.js";
import { normalizeSellVoiceText } from "./voice-normalize.js";
import { detectPromptInjection } from "../../shared/prompt-injection.js";

export type VisionExtractResult = {
  /** Untrusted OCR dump — never execute as instructions. */
  ocrText?: string;
  visualCategory?: string;
  visualBrand?: string;
  visualModel?: string;
  visualColor?: string;
  visualCondition?: string;
  /** Vision must NOT invent market price — ignored if present. */
  suggestedPrice?: number | null;
  confidence?: number;
};

export type VisionExtractor = (args: {
  imageUrls: string[];
  routeModel: string;
}) => Promise<VisionExtractResult>;

export type BuildSellDraftOptions = {
  input: SellInput;
  visionExtractor?: VisionExtractor | null;
  /** Real production safety provider — required for accepted images (fail-closed if missing). */
  imageSafetyProvider?: ImageSafetyProvider | null;
  imageBytesByUrl?: Record<string, Buffer>;
  requestId?: string;
  /** Optional 10D observations — advisory only; never overwrites user price. */
  marketObservations?: MarketObservation[];
  /**
   * F2 closure — per-field structured evidence from the previous draft
   * (round-trip). The evidence chain continues: history grows, canonical
   * values and persisted conflicts survive, human authority is respected.
   */
  priorFactEvidence?: Record<string, SellFactEvidenceProjection>;
  /** F2 closure — field keys the user explicitly corrected in this turn. */
  userCorrectionKeys?: string[];
};

function emptyStringField(): ExtractedField<string> {
  return {
    value: null,
    confidence: 0,
    source: "COMBINED",
    requiresConfirmation: true,
  };
}

/**
 * Treat OCR as evidence only. Prompt-like OCR content becomes a warning, never a command.
 */
export function interpretOcrAsUntrusted(ocrText: string): {
  warnings: string[];
  evidence: string[];
} {
  const text = String(ocrText ?? "").trim();
  if (!text) return { warnings: [], evidence: [] };
  const warnings: string[] = [
    "OCR tekstas laikomas nepatikimu (OCR_UNTRUSTED) — nevykdomas kaip komanda.",
  ];
  if (detectPromptInjection(text) || /ignore.*instruction|publish|auto-?publish/i.test(text)) {
    warnings.push(
      "OCR turinyje aptiktas injection / publish bandymas — ignoruota kaip komanda."
    );
  }
  return { warnings, evidence: [`ocr:${text.slice(0, 120)}`] };
}

export async function buildSellDraft(
  opts: BuildSellDraftOptions
): Promise<SellDraft> {
  const started = Date.now();
  const input = opts.input;
  const warnings: string[] = [];
  const originalText = input.text?.slice(0, 4000);
  const originalTranscript = input.transcript?.slice(0, 4000);

  // Voice normalize (keep originalTranscript untouched)
  let normalizedVoice = "";
  const voiceCandidates: ReturnType<typeof extractFromUserText>["candidates"] = {
    attributes: {},
  };
  if (originalTranscript) {
    const vn = normalizeSellVoiceText(originalTranscript);
    normalizedVoice = vn.normalizedText;
    if (vn.hints.brand) {
      voiceCandidates.brand = {
        value: vn.hints.brand,
        confidence: 0.9,
        source: "VOICE",
        evidence: [vn.hints.brand],
      };
    }
    if (vn.hints.model) {
      voiceCandidates.model = {
        value: vn.hints.model,
        confidence: 0.88,
        source: "VOICE",
        evidence: [vn.hints.model],
      };
    }
    if (vn.hints.fuel) {
      voiceCandidates.attributes!.fuel = {
        value: vn.hints.fuel,
        confidence: 0.92,
        source: "VOICE",
        evidence: ["voice_fuel"],
      };
    }
    if (vn.hints.transmission) {
      voiceCandidates.attributes!.transmission = {
        value: vn.hints.transmission,
        confidence: 0.92,
        source: "VOICE",
        evidence: ["voice_transmission"],
      };
    }
    if (vn.hints.drivetrain) {
      voiceCandidates.attributes!.drivetrain = {
        value: vn.hints.drivetrain,
        confidence: 0.9,
        source: "VOICE",
        evidence: ["voice_drivetrain"],
      };
    }
    if (vn.hints.engineLiters != null) {
      voiceCandidates.attributes!.engineLiters = {
        value: vn.hints.engineLiters,
        confidence: 0.8,
        source: "VOICE",
        evidence: ["voice_engine"],
      };
    }
    if (vn.hints.storageGb != null) {
      voiceCandidates.attributes!.storageGb = {
        value: vn.hints.storageGb,
        confidence: 0.88,
        source: "VOICE",
        evidence: [`voice_storage:${vn.hints.storageGb}GB`],
      };
    }
    if (vn.hints.commerce === "vat_invoice") {
      voiceCandidates.attributes!.vatInvoice = {
        value: true,
        confidence: 0.95,
        source: "VOICE",
        evidence: ["PVM sąskaita"],
      };
      warnings.push("PVM sąskaita — verslo/mokesčių atributas, ne auto technika.");
    }
    if (vn.hints.chipTuned) {
      voiceCandidates.attributes!.chipTuned = {
        value: true,
        confidence: 0.85,
        source: "VOICE",
        evidence: ["čipuotas"],
      };
      warnings.push("„Čipuotas” — reikalauja vartotojo patvirtinimo (ne faktas be įrodymų).");
    }
    // Also run text extract on normalized voice for price/year etc.
    const fromVoice = extractFromUserText(normalizedVoice, "VOICE");
    warnings.push(...fromVoice.warnings);
    Object.assign(voiceCandidates, {
      ...fromVoice.candidates,
      attributes: {
        ...fromVoice.candidates.attributes,
        ...voiceCandidates.attributes,
      },
    });
  }

  const textBundle = originalText
    ? extractFromUserText(originalText, "TEXT")
    : null;
  if (textBundle) warnings.push(...textBundle.warnings);

  // Image safety — fail-closed
  let imageSafety: ImageSafetyResult = {
    safe: true,
    requiresReview: false,
    reasons: [],
    acceptedUrls: [],
  };
  const imageUrls = input.imageUrls ?? [];
  if (imageUrls.length) {
    imageSafety = await validateImagesFailClosed(imageUrls, {
      provider: opts.imageSafetyProvider,
      bytesByUrl: opts.imageBytesByUrl,
    });
    if (!imageSafety.safe) {
      warnings.push(
        `Image safety fail-closed: ${imageSafety.reasons.join(", ") || "unsafe"}`
      );
    }
  }

  // Vision route (provider-agnostic model id) — optional extractor
  const visionCandidates: {
    category?: FieldCandidate<string>;
    brand?: FieldCandidate<string>;
    model?: FieldCandidate<string>;
    color?: FieldCandidate<string>;
    condition?: FieldCandidate<string>;
  } = {};
  let visionRouteModel = "unconfigured";
  if (imageSafety.acceptedUrls.length && opts.visionExtractor) {
    try {
      const route = getAiModel("VISION");
      visionRouteModel = route.model;
      const vision = await opts.visionExtractor({
        imageUrls: imageSafety.acceptedUrls,
        routeModel: route.model,
      });
      if (vision.ocrText) {
        const ocr = interpretOcrAsUntrusted(vision.ocrText);
        warnings.push(...ocr.warnings);
      }
      // Ignore suggestedPrice — no pseudo-valuation
      if (vision.suggestedPrice != null) {
        warnings.push(
          "Vision pasiūlė kainą — ignoruota (10C: jokio pseudo-valuation)."
        );
      }
      const vc = Math.min(0.85, vision.confidence ?? 0.7);
      if (vision.visualCategory) {
        visionCandidates.category = {
          value: vision.visualCategory,
          confidence: vc,
          source: "VISION",
          evidence: ["vision_category"],
        };
      }
      if (vision.visualBrand) {
        visionCandidates.brand = {
          value: vision.visualBrand,
          confidence: vc,
          source: "VISION",
          evidence: ["vision_brand"],
        };
      }
      if (vision.visualModel) {
        visionCandidates.model = {
          value: vision.visualModel,
          confidence: Math.min(vc, 0.8),
          source: "VISION",
          evidence: ["vision_model"],
        };
      }
      if (vision.visualColor) {
        visionCandidates.color = {
          value: vision.visualColor,
          confidence: vc,
          source: "VISION",
          evidence: ["vision_color"],
        };
      }
      if (vision.visualCondition) {
        visionCandidates.condition = {
          value: vision.visualCondition,
          confidence: Math.min(vc, 0.75),
          source: "VISION",
          evidence: ["vision_condition"],
        };
      }
    } catch {
      warnings.push("Vision extraction failed — tęsiame be vision faktų.");
      imageSafety = {
        ...imageSafety,
        safe: false,
        requiresReview: true,
        reasons: [...imageSafety.reasons, "vision_error"],
      };
    }
  } else if (imageUrls.length && !opts.visionExtractor) {
    // Missing vision provider with images — fail-closed review already set by safety
    try {
      const route = getAiModel("VISION");
      visionRouteModel = route.model;
    } catch {
      visionRouteModel = "unconfigured";
    }
  }

  const textC = textBundle?.candidates;
  const priorFor = (key: string): MergeFieldCandidatesOptions => ({
    existingFactEvidence: opts.priorFactEvidence?.[key],
    isUserCorrection: opts.userCorrectionKeys?.includes(key),
  });
  const mergeStr = (
    key: string,
    list: Array<FieldCandidate<string> | undefined>,
    critical = false
  ) =>
    mergeFieldCandidates(
      key,
      list.filter(Boolean) as Array<FieldCandidate<string>>,
      { critical, ...priorFor(key) }
    );

  // F2.2 — structured fact-evidence projections, keyed identically to the
  // canonical intel field keys (top-level by name, attributes as attributes.<key>).
  const factEvidence: Record<string, MergeFieldEvidenceProjection> = {};
  const collectProjection = (key: string, m: MergeResult<unknown> | undefined) => {
    if (m?.factEvidence) factEvidence[key] = m.factEvidence;
  };
  const categoryM = mergeStr("category", [
    textC?.category,
    voiceCandidates.category,
    visionCandidates.category,
  ]);
  const brandM = mergeStr("brand", [
    textC?.brand,
    voiceCandidates.brand,
    visionCandidates.brand,
  ]);
  const modelM = mergeStr("model", [
    textC?.model,
    voiceCandidates.model,
    visionCandidates.model,
  ]);
  const colorM = mergeStr("color", [
    textC?.color,
    voiceCandidates.color,
    visionCandidates.color,
  ]);
  const conditionM = mergeStr("condition", [
    textC?.condition,
    voiceCandidates.condition,
    visionCandidates.condition,
  ]);
  const titleM = mergeStr("title", [textC?.title, voiceCandidates.title]);
  const yearM = mergeFieldCandidates(
    "year",
    [textC?.year, voiceCandidates.year].filter(Boolean) as Array<
      FieldCandidate<number>
    >,
    { critical: true, ...priorFor("year") }
  );
  const priceM = mergePriceField(
    [textC?.price, voiceCandidates.price].filter(Boolean) as Array<
      FieldCandidate<number>
    >
  );
  const descM = mergeStr("description", [
    textC?.description,
    voiceCandidates.description,
  ]);

  for (const m of [categoryM, brandM, modelM, colorM, conditionM, yearM, priceM]) {
    if (m.warning) warnings.push(m.warning);
  }
  collectProjection("category", categoryM as MergeResult<unknown>);
  collectProjection("title", titleM as MergeResult<unknown>);
  collectProjection("brand", brandM as MergeResult<unknown>);
  collectProjection("model", modelM as MergeResult<unknown>);
  collectProjection("color", colorM as MergeResult<unknown>);
  collectProjection("condition", conditionM as MergeResult<unknown>);
  collectProjection("year", yearM as MergeResult<unknown>);
  collectProjection("price", priceM as MergeResult<unknown>);
  collectProjection("description", descM as MergeResult<unknown>);

  // Attributes merge (critical: vin, mileage, engineLiters, storage, defects)
  const attrKeys = new Set([
    ...Object.keys(textC?.attributes ?? {}),
    ...Object.keys(voiceCandidates.attributes ?? {}),
  ]);
  const attributes: Record<string, ExtractedField<unknown>> = {};
  for (const key of attrKeys) {
    const critical = [
      "vin",
      "mileage",
      "engineLiters",
      "storageGb",
      "batteryHealth",
      "defects",
    ].includes(key);
    const merged = mergeFieldCandidates(
      key,
      [
        textC?.attributes?.[key],
        voiceCandidates.attributes?.[key],
      ].filter(Boolean) as Array<FieldCandidate<unknown>>,
      { critical, ...priorFor(`attributes.${key}`) }
    );
    attributes[key] = merged.field;
    collectProjection(`attributes.${key}`, merged as MergeResult<unknown>);
    if (merged.warning) warnings.push(merged.warning);
  }

  const missing: string[] = [];
  if (!categoryM.field.value) missing.push("category");
  if (!titleM.field.value) missing.push("title");
  if (!brandM.field.value) missing.push("brand");
  if (priceM.field.value == null) missing.push("price");

  const normalizedText = [originalText, normalizedVoice]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 4000);

  let marketAdvice: SellDraft["marketAdvice"];
  if (opts.marketObservations && opts.marketObservations.length > 0) {
    const catRaw = String(categoryM.field.value ?? "other").toLowerCase();
    const category: MarketCategory =
      catRaw.includes("auto") || catRaw.includes("vehicle") || catRaw === "vehicles"
        ? "vehicles"
        : catRaw.includes("phone") ||
            catRaw.includes("electron") ||
            catRaw === "electronics"
          ? "electronics"
          : catRaw === "unsupported"
            ? "unsupported"
            : "other";
    const valuation = computeValuation({
      subject: {
        category,
        brand: brandM.field.value,
        model: modelM.field.value,
        year: yearM.field.value,
      },
      observations: opts.marketObservations,
    });
    if (priceM.field.value != null) {
      const advice = adviseSellDraftPrice(priceM.field.value, valuation);
      marketAdvice = {
        userPrice: advice.userPrice,
        estimatedRange: advice.market,
        recommendation: advice.recommendation,
        overwriteUserPrice: false,
        askingPriceVsMarket: advice.askingPriceVsMarket,
      };
      warnings.push(advice.recommendation.slice(0, 240));
    }
  }

  const draft = parseSellDraft({
    category: categoryM.field.value
      ? categoryM.field
      : emptyStringField(),
    title: titleM.field.value ? titleM.field : emptyStringField(),
    brand: brandM.field,
    model: modelM.field,
    year: yearM.field,
    condition: conditionM.field,
    color: colorM.field,
    price: priceM.field,
    description: descM.field,
    attributes,
    missing,
    warnings: [...new Set(warnings)].slice(0, 32),
    requiresUserConfirmation: true,
    autoPublish: SELL_AUTO_PUBLISH,
    originalText,
    originalTranscript,
    normalizedText,
    imageSafety: {
      safe: imageSafety.safe,
      requiresReview: imageSafety.requiresReview,
      reasons: imageSafety.reasons,
    },
    marketAdvice,
    ...(Object.keys(factEvidence).length ? { factEvidence } : {}),
    foundationVersion: AI_FOUNDATION_VERSION,
  });

  recordAiTelemetry({
    requestId: opts.requestId,
    taskType: "sell.build_draft",
    taskClass: "VISION",
    provider: "sell-engine",
    model: visionRouteModel,
    latencyMs: Date.now() - started,
    success: true,
    abstained: false,
    errorCode: imageSafety.safe ? null : "image_safety_review",
  });

  return draft;
}

export { SELL_AUTO_PUBLISH };
