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
import { extractCombined, extractFromImage, extractFromText } from "@/lib/client-api";
import { distanceToCity, getUserCoords } from "@/lib/geolocation";
import { withAiTimeout } from "@/lib/ai-safeguards";
import { RECOVERY_PROCESSING_TIMEOUT_MS } from "@/lib/ai-conversational-recovery";
import { runConductorSearchExecutor } from "./conductor-agent-bridge";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import type {
  ConductorAgentExecuteMeta,
  ConductorBarcodeExecuteMeta,
  ConductorSearchExecuteMeta,
  ConductorTextExecuteMeta,
  ConductorTextExtractInput,
  ConductorVehicleExecuteMeta,
  ConductorVisionExecuteMeta,
  ConductorVisionExtractInput,
} from "./types";

function resolveLocationHint(userCity: string): Promise<string> {
  return getUserCoords({ requestPermission: true }).then((coords) => {
    if (!coords) return userCity;
    const d = distanceToCity(coords, userCity);
    return d !== null && d < 50 ? userCity : userCity;
  });
}

export async function executeConductorVisionExtract(
  input: ConductorVisionExtractInput
): Promise<ConductorVisionExecuteMeta> {
  const locationHint = await resolveLocationHint(input.userCity);
  const ctx = {
    imageDataUrl: input.imageDataUrl,
    imageDataUrls: input.imageDataUrls,
    transcript: input.transcript,
    extraContext: input.extraContext,
    userCity: locationHint,
    contact: input.contact,
  };
  const timeoutMs = input.recoveryRetry ? RECOVERY_PROCESSING_TIMEOUT_MS : undefined;
  const extractPromise =
    input.mode === "combined" ? extractCombined(ctx) : extractFromImage(ctx);
  const extracted = await withAiTimeout(
    extractPromise,
    timeoutMs,
    `conductor_extract_${input.mode}`
  );
  return { mode: input.mode, extracted, locationHint };
}

export async function executeConductorTextExtract(
  input: ConductorTextExtractInput
): Promise<ConductorTextExecuteMeta> {
  const locationHint = await resolveLocationHint(input.userCity);
  const ctx = {
    transcript: input.transcript,
    extraContext: input.extraContext,
    userCity: locationHint,
    contact: input.contact,
  };
  const timeoutMs = input.recoveryRetry ? RECOVERY_PROCESSING_TIMEOUT_MS : undefined;
  const extracted = await withAiTimeout(
    extractFromText(ctx),
    timeoutMs,
    `conductor_extract_${input.mode}`
  );
  return { mode: input.mode, extracted, locationHint };
}

export async function executeConductorSearchQuery(
  query: string
): Promise<ConductorSearchExecuteMeta | null> {
  const agentResult = await runConductorSearchExecutor(query);
  if (!agentResult) return null;
  return { query, agentResult };
}

export async function executeConductorAgentAction(
  action: VautoAgentAction
): Promise<ConductorAgentExecuteMeta> {
  switch (action.type) {
    case "listing_draft":
    case "wardrobe_bulk":
      // Draft commit is owned by SellerFlowContext.applyAgent* — avoid double commit races.
      return { actionType: action.type, action, draftCommitted: false };
    default:
      return { actionType: action.type, action, draftCommitted: false };
  }
}

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
