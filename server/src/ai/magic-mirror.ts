import { unifiedLlmJson } from "./llm-provider.js";

export interface BodyMeasurements {
  heightCm?: number;
  bustCm?: number;
  waistCm?: number;
  hipsCm?: number;
  usualSize?: string;
}

export interface GarmentMeasurements {
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  lengthCm?: number;
  sizeLabel?: string;
}

export interface MagicMirrorResult {
  fitScore: number;
  verdict: "ideal" | "good" | "tight" | "loose" | "unknown";
  recommendation: string;
  sellerTip?: string;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function heuristicFit(
  buyer: BodyMeasurements,
  garment: GarmentMeasurements,
  buyerName: string,
  listingTitle: string
): MagicMirrorResult {
  const item = listingTitle.trim() || "drabužis";
  const first = buyerName.trim().split(/\s+/)[0] || "drauge";

  if (!buyer.usualSize && !buyer.waistCm && !garment.sizeLabel && !garment.waistCm) {
    return {
      fitScore: 72,
      verdict: "unknown",
      recommendation: `${first}, pagal turimus duomenis rekomenduoju pasitikrinti dydžio etiketę — parašyk pardavėjai savo įprastą dydį.`,
    };
  }

  const sizeMap: Record<string, number> = { XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6 };
  const buyerSize = sizeMap[(buyer.usualSize ?? "M").toUpperCase()] ?? 3;
  const garmentSize = sizeMap[(garment.sizeLabel ?? "M").toUpperCase()] ?? 3;
  const delta = garmentSize - buyerSize;

  if (delta === 0) {
    return {
      fitScore: 96,
      verdict: "ideal",
      recommendation: `${first}, pagal tavo figūrą ir dydį ${garment.sizeLabel ?? buyer.usualSize} šis ${item} tiks idealiai.`,
      sellerTip: "Pirkėjos profilis sutampa su dydžiu — pabrėžk tai pokalbyje.",
    };
  }
  if (delta === 1) {
    return {
      fitScore: 78,
      verdict: "loose",
      recommendation: `${first}, ${item} gali būti šiek tiek laisvesnis — tinka oversize stiliui ar sluoksniavimui.`,
    };
  }
  if (delta === -1) {
    return {
      fitScore: 74,
      verdict: "tight",
      recommendation: `${first}, ${item} gali sėdėti aptemptai — verta paklausti medžiagos tempimo.`,
    };
  }
  return {
    fitScore: 55,
    verdict: delta > 0 ? "loose" : "tight",
    recommendation: `${first}, dydžių skirtumas didesnis — rekomenduoju pasitarti su pardavėja dėl tikslių matmenų.`,
  };
}

/** Virtuali matavimosi kabina — palygina drabužio ir pirkėjos matmenis. */
export async function analyzeMagicMirrorFit(params: {
  buyerName: string;
  listingTitle: string;
  buyerMeasurements: BodyMeasurements;
  garmentMeasurements: GarmentMeasurements;
  listingDescription?: string;
}): Promise<MagicMirrorResult> {
  const fallback = heuristicFit(
    params.buyerMeasurements,
    params.garmentMeasurements,
    params.buyerName,
    params.listingTitle
  );

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: `Tu esi VAUTO Magic Mirror — drabužių fit AI. Grąžink JSON:
{"fitScore":0-100,"verdict":"ideal|good|tight|loose|unknown","recommendation":"string lietuviškai","sellerTip":"string optional"}
Jokių geografinių nuorodų. Rekomendacija turi kreiptis į pirkėją vardu.`,
      prompt: `Pirkėja: ${params.buyerName}
Profilis: ${JSON.stringify(params.buyerMeasurements)}
Drabužis: ${params.listingTitle}
Matmenys: ${JSON.stringify(params.garmentMeasurements)}
Aprašymas: ${params.listingDescription ?? ""}`,
    });

    const verdictRaw = String(raw.verdict ?? fallback.verdict);
    const verdict = ["ideal", "good", "tight", "loose", "unknown"].includes(verdictRaw)
      ? (verdictRaw as MagicMirrorResult["verdict"])
      : fallback.verdict;

    return {
      fitScore: clamp(Number(raw.fitScore) || fallback.fitScore),
      verdict,
      recommendation: String(raw.recommendation ?? fallback.recommendation).trim() || fallback.recommendation,
      sellerTip: raw.sellerTip ? String(raw.sellerTip) : fallback.sellerTip,
    };
  } catch {
    return fallback;
  }
}
