import { runOcrPipeline } from "../services/visual-pipeline/providers/ocr.js";
import { visualPipelineFeatures } from "../services/visual-pipeline/features.js";
import {
  extractBarcodesFromText,
  extractBarcodeFromQrPayload,
  isValidBarcode,
  normalizeBarcode,
} from "./barcode-utils.js";
import { lookupBarcodeLive, lookupBarcodeOnServer, productLookupFeatures } from "./barcode-lookup.js";
import type { BarcodeLookupResult } from "./product-lookup-types.js";
import { generateFashionListingCopy, type FashionListingCopy } from "./product-fashion-description.js";

export type { BarcodeLookupResult, FashionListingCopy };
export { lookupBarcodeOnServer, lookupBarcodeLive, productLookupFeatures };

export type ServerProductLookupResult = BarcodeLookupResult & {
  identifier: string;
};

export async function lookupProductOnServer(
  identifier?: string
): Promise<ServerProductLookupResult | null> {
  const raw = identifier?.trim() ?? "";
  if (!raw) return null;
  const result = await lookupBarcodeOnServer(raw);
  if (!result) return null;
  return { ...result, identifier: result.barcode };
}

export async function extractBarcodeFromImage(
  imageDataUrl: string
): Promise<string | null> {
  if (!imageDataUrl.trim()) return null;
  const features = visualPipelineFeatures();
  if (features.ocr === "none") return null;

  try {
    const ocr = await runOcrPipeline(
      [{ id: "0", sourceUrl: imageDataUrl.trim() }],
      features.ocr
    );
    const fromText = extractBarcodesFromText(ocr.mergedText);
    if (fromText[0]) return fromText[0];
    for (const code of ocr.extractedCodes) {
      if (isValidBarcode(code)) return normalizeBarcode(code);
      const fromQr = extractBarcodeFromQrPayload(code);
      if (fromQr) return fromQr;
    }
  } catch {
    return null;
  }
  return null;
}

export async function generateProductFashionDescription(
  product: BarcodeLookupResult,
  opts?: { category?: string; hint?: string }
): Promise<FashionListingCopy> {
  return generateFashionListingCopy(product, opts);
}
