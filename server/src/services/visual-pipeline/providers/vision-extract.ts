import { visionExtractJson } from "../../../ai/llm-provider.js";
import {
  extractBarcodesFromText,
  isValidBarcode,
  normalizeBarcode,
} from "../../../product/barcode-utils.js";
import { isPlausibleVin, normalizeVin } from "../../../vehicle/vin-utils.js";
import type { VisionExtractResult, VisualPipelineImageInput } from "../types.js";

const VISION_CODE_SCHEMA = `{
  "textBlocks": ["string"],
  "vin": "string|null",
  "plateNumber": "string|null",
  "barcode": "string|null",
  "modelCode": "string|null",
  "confidence": 0.0
}`;

const VISION_CODE_PROMPT = `Tu esi VAUTO vizualinio kodo skaitytuvas.
Iš nuotraukų ištrauk TIK realiai matomus tekstinius identifikatorius:
- VIN / kėbulo numerį (17 simbolių, be I/O/Q)
- valstybinį numerį
- EAN/UPC/ISBN brūkšninį kodą
- modelio / serijos / SKU kodą

Nespėliok ir nekurk kodų. Jei nesimato, grąžink null.
textBlocks turi būti tik trumpi matomi tekstai nuo lipdukų, etikečių arba VIN lentelės.
Grąžink JSON: ${VISION_CODE_SCHEMA}`;

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").trim()).filter(Boolean).slice(0, 12);
}

function cleanString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null") return undefined;
  return text;
}

function cleanVin(value: unknown, fallbackText: string): string | undefined {
  const direct = cleanString(value);
  const candidate = direct ? normalizeVin(direct) : "";
  if (candidate && isPlausibleVin(candidate)) return candidate;
  const fromText = fallbackText.toUpperCase().match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1];
  return fromText && isPlausibleVin(fromText) ? normalizeVin(fromText) : undefined;
}

function cleanPlate(value: unknown, fallbackText: string): string | undefined {
  const direct = cleanString(value);
  const source = direct || fallbackText;
  const match = source.toUpperCase().match(/\b([A-Z]{3})\s?(\d{3})\b/);
  return match ? `${match[1]} ${match[2]}` : undefined;
}

function cleanBarcode(value: unknown, fallbackText: string): string | undefined {
  const direct = cleanString(value);
  if (direct && isValidBarcode(direct)) return normalizeBarcode(direct);
  const fromText = extractBarcodesFromText(fallbackText);
  return fromText[0];
}

export async function runVisionCodeExtract(
  images: VisualPipelineImageInput[]
): Promise<VisionExtractResult> {
  const urls = images.map((i) => i.processedUrl ?? i.sourceUrl).slice(0, 4);
  if (!urls.length) {
    return { mergedText: "", extractedCodes: [], confidence: 0 };
  }

  const raw = await visionExtractJson(VISION_CODE_PROMPT, urls);
  const textBlocks = stringList(raw.textBlocks);
  const modelCode = cleanString(raw.modelCode);
  const mergedText = [...textBlocks, modelCode].filter(Boolean).join("\n");
  const vin = cleanVin(raw.vin, mergedText);
  const plateNumber = cleanPlate(raw.plateNumber, mergedText);
  const barcode = cleanBarcode(raw.barcode, mergedText);
  const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0.45));

  const extractedCodes = [
    barcode,
    modelCode,
    vin,
    plateNumber,
    ...extractBarcodesFromText(mergedText),
  ].filter((v): v is string => Boolean(v));

  return {
    mergedText,
    extractedCodes: [...new Set(extractedCodes)],
    vin,
    plateNumber,
    barcode,
    modelCode,
    confidence,
  };
}
