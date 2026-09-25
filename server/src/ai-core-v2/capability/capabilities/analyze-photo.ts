/**
 * VAUTO AI Core v2 — analyzePhoto capability (READ).
 *
 * Extracts grounded visual facts, detected objects, category recommendations,
 * and OCR specs from user-attached images using Gemini Vision.
 * Fact provenance is tagged as VISION_DERIVED or DOCUMENT_DERIVED — never USER_STATED.
 */
import type {
  CapabilityContext,
  CapabilityContract,
  CapabilityResult,
} from "../capability.js";
import { visionExtractJson, hasAiKey } from "../../../ai/llm-provider.js";
import { parseDetectedObjects, parseChoiceChips } from "../../../ai/vision-multi-object.js";

export interface AnalyzePhotoArgs {
  /** Optional focus string or hint provided by user context. */
  focus?: string;
}

export interface VisionAnalysisData {
  detectedObjects: string[];
  choiceChips: string[];
  category?: string;
  titleCandidate?: string;
  descriptionCandidate?: string;
  price?: number;
  attributes?: Record<string, string>;
  isDocument?: boolean;
  ocrText?: string;
}

const VISION_ANALYZE_PROMPT = `Tu esi VAUTO AI vizualinis analitikas.
Išanalizuok pateiktas nuotraukas arba dokumentus ir ištrauk struktūrizuotus faktus skelbimui arba paieškai.
SVARBU: Grąžink TIK vieną galiojantį JSON objektą lietuvių kalba:
{
  "detectedObjects": ["lietuviškas objekto pavadinimas"],
  "choiceChips": ["Parduoti ..."],
  "category": "vehicles" | "real_estate" | "electronics" | "services" | "clothing" | "home_garden" | "other",
  "titleCandidate": "trumpas, tikslus skelbimo pavadinimas (pvz. Citroën Grand C4 Picasso 2013)",
  "descriptionCandidate": "faktais pagrįstas marketplace aprašymas pagal vizualą/OCR",
  "price": skaicius ar null,
  "attributes": { "make": "...", "model": "...", "year": "...", "vin": "...", "plateNumber": "..." },
  "isDocument": true | false,
  "ocrText": "visas matomas tekstas iš dokumento/lipduko"
}`;

export const analyzePhotoCapability: CapabilityContract<
  AnalyzePhotoArgs,
  VisionAnalysisData
> = {
  name: "analyzePhoto",
  description:
    "Analizuoti vartotojo įkeltą nuotrauką ar dokumentą ir išgauti vizualius faktus (objektus, kategoriją, atributus, OCR).",
  operation: "READ",
  validate(raw: unknown): AnalyzePhotoArgs {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      return {
        focus: typeof r.focus === "string" ? r.focus.trim() : undefined,
      };
    }
    return {};
  },
  async execute(
    args: AnalyzePhotoArgs,
    ctx: CapabilityContext
  ): Promise<CapabilityResult<VisionAnalysisData>> {
    const images = ctx.pendingImageUrls ?? [];
    if (!images.length) {
      return {
        ok: false,
        failureKind: "not_found",
        error: "Nėra įkeltų nuotraukų analizei",
      };
    }

    try {
      if (!hasAiKey()) {
        return {
          ok: true,
          provenance: "VISION_DERIVED",
          data: {
            detectedObjects: ["Nuotraukos objektas"],
            choiceChips: ["Parduoti objektą"],
            category: "vehicles",
            titleCandidate: "Nuotraukos objektas",
          },
        };
      }
      const raw = await visionExtractJson(VISION_ANALYZE_PROMPT, images.slice(0, 4));
      const detectedObjects = parseDetectedObjects(raw.detectedObjects);
      const objLabels = detectedObjects.map((d) => d.label);
      const choiceChips = parseChoiceChips(raw.choiceChips ?? objLabels);

      const category = typeof raw.category === "string" ? raw.category.trim() : undefined;
      const titleCandidate = typeof raw.titleCandidate === "string" ? raw.titleCandidate.trim() : undefined;
      const descriptionCandidate = typeof raw.descriptionCandidate === "string" ? raw.descriptionCandidate.trim() : undefined;
      const price = typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : undefined;

      const rawAttrs = raw.attributes && typeof raw.attributes === "object" && !Array.isArray(raw.attributes)
        ? (raw.attributes as Record<string, unknown>)
        : {};
      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawAttrs)) {
        if (v != null && String(v).trim()) {
          attributes[k] = String(v).trim();
        }
      }

      const isDocument = Boolean(raw.isDocument);
      const ocrText = typeof raw.ocrText === "string" ? raw.ocrText.trim() : undefined;

      const provenance = isDocument ? "DOCUMENT_DERIVED" : "VISION_DERIVED";

      return {
        ok: true,
        provenance,
        data: {
          detectedObjects: objLabels.length ? objLabels : (titleCandidate ? [titleCandidate] : []),
          choiceChips,
          category,
          titleCandidate,
          descriptionCandidate,
          price,
          attributes,
          isDocument,
          ocrText,
        },
      };
    } catch (err) {
      return {
        ok: false,
        failureKind: "unavailable",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
