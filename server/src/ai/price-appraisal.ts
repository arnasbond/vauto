import type { AgentListingSummary } from "./agent-tools.js";
import { runMarketPriceAnalysis } from "./market-price-analysis.js";
import {
  findMarketPriceHistory,
  upsertMarketPriceHistory,
} from "./market-price-history.js";
import { unifiedLlmJson } from "./llm-provider.js";

/** Gemini Vision / extract metadata for appraisal */
export interface ImageMetadata {
  title?: string;
  description?: string;
  condition?: string;
  brand?: string;
  make?: string;
  model?: string;
  year?: string;
  color?: string;
  city?: string;
  proposedPrice?: number;
  attributes?: Record<string, unknown>;
}

export interface PriceAppraisalResult {
  minPrice: number;
  maxPrice: number;
  optimalPrice: number;
  appraisalScore: number;
  sampleSize: number;
  minNegotiationPrice: number;
  message: string;
  source: "history" | "live" | "vision";
}

function conditionMultiplier(condition: string | undefined): number {
  const c = (condition ?? "").toLowerCase();
  if (/nauj|new|nenaudot/i.test(c)) return 1.08;
  if (/blog|defect|broken/i.test(c)) return 0.82;
  if (/patenkin|fair/i.test(c)) return 0.92;
  if (/gera|good|puik/i.test(c)) return 1.0;
  return 1.0;
}

function computeAppraisalScore(sampleSize: number, hasVisionMeta: boolean): number {
  let score = Math.min(95, 35 + sampleSize * 8);
  if (hasVisionMeta) score = Math.min(98, score + 12);
  if (sampleSize < 2) score = Math.min(score, 45);
  return Math.round(score);
}

function buildMessage(
  min: number,
  max: number,
  optimal: number,
  sampleSize: number,
  city?: string
): string {
  const scope = city ? `${city} rinkoje` : "Lietuvos rinkoje";
  return `${scope} rasta ${sampleSize} panašių skelbimų. Rekomenduojamas rėžis: ${min}–${max} €, optimali kaina ~${optimal} €.`;
}

/**
 * Kainų rekomendacijų variklis — lygina Vision metadata su marketPriceHistory ir gyva DB.
 */
export async function calculateAppraisal(
  imageMetadata: ImageMetadata,
  category: string,
  listings: AgentListingSummary[]
): Promise<PriceAppraisalResult> {
  const city = imageMetadata.city;
  const condition =
    imageMetadata.condition ??
    String(imageMetadata.attributes?.condition ?? "");

  const cached = await findMarketPriceHistory({
    category,
    city,
    condition,
    attributes: imageMetadata.attributes,
  });

  if (cached && cached.sampleSize >= 2) {
    const mult = conditionMultiplier(condition);
    const minPrice = Math.round(cached.minPrice * mult);
    const maxPrice = Math.round(cached.maxPrice * mult);
    const optimalPrice = Math.round(cached.optimalPrice * mult);
    const minNegotiationPrice = Math.max(1, Math.round(optimalPrice * 0.88));

    return {
      minPrice,
      maxPrice,
      optimalPrice,
      appraisalScore: computeAppraisalScore(cached.sampleSize, true),
      sampleSize: cached.sampleSize,
      minNegotiationPrice,
      message: buildMessage(minPrice, maxPrice, optimalPrice, cached.sampleSize, city),
      source: "history",
    };
  }

  const analysis = runMarketPriceAnalysis(listings, {
    title: imageMetadata.title ?? "",
    category,
    city,
    make: imageMetadata.make ?? String(imageMetadata.attributes?.make ?? ""),
    model: imageMetadata.model ?? String(imageMetadata.attributes?.model ?? ""),
    year: imageMetadata.year ?? String(imageMetadata.attributes?.year ?? ""),
  });

  if (
    analysis.sampleSize < 1 ||
    analysis.minPrice == null ||
    analysis.maxPrice == null ||
    analysis.medianPrice == null
  ) {
    const fallbackOptimal =
      imageMetadata.proposedPrice && imageMetadata.proposedPrice > 0
        ? imageMetadata.proposedPrice
        : 50;
    return {
      minPrice: Math.max(1, Math.round(fallbackOptimal * 0.75)),
      maxPrice: Math.round(fallbackOptimal * 1.25),
      optimalPrice: fallbackOptimal,
      appraisalScore: 25,
      sampleSize: 0,
      minNegotiationPrice: Math.max(1, Math.round(fallbackOptimal * 0.85)),
      message:
        "Dar trūksta rinkos duomenų — naudojame pradinį AI vertinimą. Patikslinkite kainą rankiniu būdu.",
      source: "vision",
    };
  }

  let mult = conditionMultiplier(condition);
  let visionNote = "";

  const hasRichMeta = Boolean(
    imageMetadata.brand ||
      imageMetadata.make ||
      imageMetadata.color ||
      imageMetadata.condition
  );

  if (hasRichMeta) {
    try {
      const raw = await unifiedLlmJson({
        systemInstruction: `Tu esi VAUTO kainų vertintojas. Grąžink JSON: {"adjustmentFactor": number 0.75-1.15, "note":"string"}
adjustmentFactor — kaip Vision metadata (būklė, spalva, prekės tipas) keičia kainą vs rinkos medianą.`,
        prompt: `Kategorija: ${category}
Metadata: ${JSON.stringify({
          title: imageMetadata.title,
          condition: imageMetadata.condition,
          brand: imageMetadata.brand ?? imageMetadata.make,
          model: imageMetadata.model,
          color: imageMetadata.color,
          year: imageMetadata.year,
        })}
Rinkos medianas: ${analysis.medianPrice} €`,
      });
      const factor = Number(raw.adjustmentFactor);
      if (Number.isFinite(factor) && factor >= 0.7 && factor <= 1.2) {
        mult *= factor;
        visionNote = String(raw.note ?? "").trim();
      }
    } catch {
      /* naudojame tik conditionMultiplier */
    }
  }

  const minPrice = Math.max(1, Math.round(analysis.minPrice * mult));
  const maxPrice = Math.max(minPrice, Math.round(analysis.maxPrice * mult));
  const optimalPrice = Math.max(
    minPrice,
    Math.min(maxPrice, Math.round(analysis.medianPrice * mult))
  );
  const minNegotiationPrice = Math.max(1, Math.round(optimalPrice * 0.88));
  const appraisalScore = computeAppraisalScore(analysis.sampleSize, hasRichMeta);

  void upsertMarketPriceHistory({
    category,
    city,
    condition,
    attributes: imageMetadata.attributes,
    analysis,
    optimalPrice,
  });

  const message =
    (visionNote ? `${visionNote} ` : "") +
    buildMessage(minPrice, maxPrice, optimalPrice, analysis.sampleSize, city);

  return {
    minPrice,
    maxPrice,
    optimalPrice,
    appraisalScore,
    sampleSize: analysis.sampleSize,
    minNegotiationPrice,
    message,
    source: hasRichMeta ? "vision" : "live",
  };
}
