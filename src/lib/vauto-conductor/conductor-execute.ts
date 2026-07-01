import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import { BARCODE_LOOKUP_TIMEOUT_MS } from "@/lib/ai-safeguards";
import {
  buildUnregisteredBarcode,
  enrichBarcodeWithFashionCopy,
  lookupBarcode,
} from "@/lib/product-intelligence/barcode-lookup";
import {
  lookupVehicle,
  vehicleLookupFallback,
  vehicleLookupToDraftPatch,
} from "@/lib/vehicle-intelligence/vehicle-lookup";
import { commitConductorDraft, getConductorDraft } from "./conductor-draft-store";
import { mergeBarcodeLookupDraft, mergeVehicleLookupDraft } from "./unified-draft";
import type { ConductorBarcodeExecuteMeta, ConductorVehicleExecuteMeta } from "./types";

export async function executeConductorVehicleLookup(
  identifier: string,
  opts: { vin?: string; plate?: string }
): Promise<ConductorVehicleExecuteMeta> {
  const lookupResult = await Promise.race([
    lookupVehicle(identifier, opts),
    new Promise<Awaited<ReturnType<typeof vehicleLookupFallback>>>((resolve) =>
      window.setTimeout(() => resolve(vehicleLookupFallback(identifier)), BARCODE_LOOKUP_TIMEOUT_MS)
    ),
  ]);
  const patch = vehicleLookupToDraftPatch(lookupResult);
  const merged = mergeVehicleLookupDraft(
    getConductorDraft()?.draft,
    lookupResult,
    getConductorDraft()?.sources ?? []
  );
  commitConductorDraft(merged.draft, "vehicle");
  return { identifier, lookupResult, patch };
}

export async function executeConductorBarcodeLookup(
  barcode: string,
  category: ListingCategory
): Promise<ConductorBarcodeExecuteMeta> {
  const lookupResult = await Promise.race([
    lookupBarcode(barcode),
    new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), BARCODE_LOOKUP_TIMEOUT_MS)
    ),
  ]);

  const resolved = lookupResult ?? buildUnregisteredBarcode(barcode);
  const notFoundInRegistry = !lookupResult || Boolean(lookupResult.notFoundInRegistry);
  const patch = await enrichBarcodeWithFashionCopy(resolved, category);
  const merged = mergeBarcodeLookupDraft(
    getConductorDraft()?.draft,
    resolved,
    getConductorDraft()?.sources ?? []
  );
  commitConductorDraft(merged.draft, "barcode");

  return {
    barcode,
    category,
    lookupResult: resolved,
    patch,
    notFoundInRegistry,
    mergedDraft: merged.draft as Partial<AiExtractedListing>,
  };
}
