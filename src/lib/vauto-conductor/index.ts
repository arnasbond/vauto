import type { ConductorRequest, ConductorResult } from "./types";
import { conductorAgentActionRequest } from "./agent-actions";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";

export type { ConductorIntent, ConductorPhase, ConductorRequest, ConductorResult } from "./types";

const CONDUCTOR_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR === "1";

function logConductor(request: ConductorRequest, result: ConductorResult): ConductorResult {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[VautoConductor]", request.intent, request.source, result.phase, request.payload);
  }
  return result;
}

/**
 * VautoConductor — unified AI orchestration entry (Phase 1).
 * Phase 0: telemetry + passthrough; Phase 1+: route all entry points here.
 */
export async function routeConductorRequest(
  request: ConductorRequest
): Promise<ConductorResult> {
  if (!CONDUCTOR_ENABLED) {
    return logConductor(request, { handled: false, phase: "route", delegated: true });
  }

  switch (request.intent) {
    case "photo_upload":
    case "barcode_scan":
    case "search_query":
    case "seller_submit":
    case "vehicle_lookup":
      return logConductor(request, {
        handled: true,
        phase: "route",
        delegated: true,
        meta: { intent: request.intent, source: request.source },
      });
    case "chat":
    default:
      return logConductor(request, { handled: false, phase: "route", delegated: true });
  }
}

/** Telemetry + hook for fromSearchBar agent actions before legacy applyActions. */
export async function routeConductorAgentAction(
  action: VautoAgentAction,
  source: string
): Promise<ConductorResult> {
  if (action.type === "none") {
    return { handled: false, phase: "route", delegated: true };
  }
  return routeConductorRequest(conductorAgentActionRequest(action, source));
}

export function conductorPhotoUploadSource(component: string): ConductorRequest {
  return {
    intent: "photo_upload",
    source: component,
  };
}

export function conductorBarcodeSource(component: string): ConductorRequest {
  return {
    intent: "barcode_scan",
    source: component,
  };
}

export function conductorSearchQuerySource(component: string): ConductorRequest {
  return {
    intent: "search_query",
    source: component,
  };
}

export function conductorSellerSubmitSource(component: string): ConductorRequest {
  return {
    intent: "seller_submit",
    source: component,
  };
}

export { conductorAgentActionRequest } from "./agent-actions";
export {
  adoptConductorDraft,
  commitConductorDraft,
  getConductorDraft,
  resetConductorDraft,
} from "./conductor-draft-store";
export { buildConductorPublishSnapshot, enrichListingWithConductorMeta } from "./conductor-publish";
export type { ConductorPublishSnapshot } from "./conductor-publish";
export {
  CONDUCTOR_MERGED_AT_ATTR,
  CONDUCTOR_SOURCES_ATTR,
} from "./conductor-publish";
export { mergeListingDraft, mergeBarcodeLookupDraft, mergeVehicleLookupDraft } from "./unified-draft";
export type { UnifiedDraftSource, UnifiedListingDraft } from "./unified-draft";
