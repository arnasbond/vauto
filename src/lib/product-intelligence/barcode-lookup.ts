import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";
import {
  isBarcodeLookupEligibleCategory,
  isValidBarcode,
  normalizeBarcode,
} from "./barcode-utils";

export interface BarcodeLookupResult {
  source:
    | "open-library"
    | "open-beauty-facts"
    | "open-food-facts"
    | "upcitemdb"
    | "barcode-unregistered";
  verified: boolean;
  confidence: number;
  barcode: string;
  title: string;
  brand?: string;
  category?: string;
  quantity?: string;
  ingredients?: string;
  author?: string;
  publishYear?: string;
  specs: string[];
  technicalDescription: string;
  notFoundInRegistry?: boolean;
  userMessage?: string;
}

export const BARCODE_NOT_FOUND_MSG =
  "Kodas atpažintas, bet nerastas viešame registre. Parašykite daikto pavadinimą patys, o aš sugeneruosiu aprašymą.";

export function buildUnregisteredBarcode(barcode: string): BarcodeLookupResult {
  return {
    source: "barcode-unregistered",
    verified: false,
    confidence: 0.35,
    barcode,
    title: "",
    specs: [`EAN/UPC/ISBN: ${barcode}`],
    notFoundInRegistry: true,
    userMessage: BARCODE_NOT_FOUND_MSG,
    technicalDescription: `${BARCODE_NOT_FOUND_MSG}\n\nKodas: ${barcode}`,
  };
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
        verified: remote.verified ?? remote.source !== "barcode-unregistered",
      };
    }
    return buildUnregisteredBarcode(normalized);
  }

  if (!isValidBarcode(normalizeBarcode(normalized))) {
    return null;
  }

  return null;
}

export async function enrichBarcodeWithFashionCopy(
  result: BarcodeLookupResult,
  category: string
): Promise<Partial<AiExtractedListing>> {
  if (result.notFoundInRegistry) {
    return barcodeLookupToDraftPatch(result);
  }

  const { isDataApiEnabled } = await import("@/lib/api/config");
  if (!isDataApiEnabled() || category !== "clothing") {
    return barcodeLookupToDraftPatch(result);
  }

  try {
    const { apiFashionListingDescription } = await import("@/lib/api/client");
    const copy = await apiFashionListingDescription(result, { category: "clothing" });
    const base = barcodeLookupToDraftPatch(result);
    return {
      ...base,
      title: copy?.title ?? base.title,
      description: copy?.description ?? base.description,
      confidence: copy?.confidence ?? base.confidence,
    };
  } catch {
    return barcodeLookupToDraftPatch(result);
  }
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
    result.notFoundInRegistry
      ? existing?.title?.trim() || ""
      : existing?.title?.trim() && existing.title.length > 2
        ? existing.title
        : result.brand
          ? `${result.brand} ${result.title}`.trim()
          : result.title;

  const priorDesc = existing?.description?.trim() ?? "";
  const description = result.notFoundInRegistry
    ? priorDesc || result.userMessage || BARCODE_NOT_FOUND_MSG
    : priorDesc
      ? `${priorDesc}\n\n---\n${result.technicalDescription}`
      : result.technicalDescription;

  return {
    title: title || existing?.title,
    confidence: result.confidence,
    attributes: attrs,
    description,
  };
}

export { isBarcodeLookupEligibleCategory };
