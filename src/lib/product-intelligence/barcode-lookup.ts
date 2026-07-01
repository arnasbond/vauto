import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";
import {
  isBarcodeLookupEligibleCategory,
  isValidBarcode,
  normalizeBarcode,
} from "./barcode-utils";

export interface BarcodeLookupResult {
  source: "open-food-facts" | "upcitemdb" | "barcode-demo";
  verified: boolean;
  confidence: number;
  barcode: string;
  title: string;
  brand?: string;
  category?: string;
  quantity?: string;
  ingredients?: string;
  specs: string[];
  technicalDescription: string;
}

export async function lookupBarcode(
  identifier?: string
): Promise<BarcodeLookupResult | null> {
  const normalized = identifier?.trim() ?? "";
  if (!normalized) return null;

  const { isDataApiEnabled } = await import("@/lib/api/config");
  if (isDataApiEnabled()) {
    const { apiLookupBarcode } = await import("@/lib/api/client");
    const remote = await apiLookupBarcode(normalized);
    if (remote) {
      return {
        ...remote,
        specs: remote.specs ?? [],
        verified: remote.verified ?? remote.source !== "barcode-demo",
      };
    }
  }

  if (!isValidBarcode(normalizeBarcode(normalized))) {
    const { extractBarcodeFromQrPayload } = await import("./barcode-utils");
    const fromQr = extractBarcodeFromQrPayload(normalized);
    if (!fromQr) return null;
    return lookupBarcode(fromQr);
  }

  return lookupBarcodeDemo(normalizeBarcode(normalized));
}

function lookupBarcodeDemo(barcode: string): BarcodeLookupResult {
  return {
    source: "barcode-demo",
    verified: false,
    confidence: 0.7,
    barcode,
    title: "Universalus produktas (demo)",
    brand: "Demo",
    category: "Buitis",
    specs: ["Brūkšninis kodas atpažintas — demo režimas"],
    technicalDescription: `EAN/UPC: ${barcode}\nDuomenų šaltinis: demo adapteris.`,
  };
}

export function barcodeLookupToDraftPatch(
  result: BarcodeLookupResult,
  existing?: Pick<AiExtractedListing, "title" | "description" | "attributes">
): Partial<AiExtractedListing> {
  const attrs: CategoryAttributes = {
    ...(existing?.attributes ?? {}),
    barcode: result.barcode,
    productDataSource: result.source,
  };
  if (result.brand) attrs.brand = result.brand;
  if (result.category) attrs.productCategory = result.category;
  if (result.quantity) attrs.quantity = result.quantity;

  const title =
    existing?.title?.trim() && existing.title.length > 2
      ? existing.title
      : result.brand
        ? `${result.brand} ${result.title}`.trim()
        : result.title;

  const priorDesc = existing?.description?.trim() ?? "";
  const description = priorDesc
    ? `${priorDesc}\n\n---\n${result.technicalDescription}`
    : result.technicalDescription;

  return {
    title,
    confidence: result.confidence,
    attributes: attrs,
    description,
  };
}

export { isBarcodeLookupEligibleCategory };
