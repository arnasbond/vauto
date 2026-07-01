import type { ConductorRequest, ConductorResult } from "./types";
import { conductorAgentActionRequest } from "./agent-actions";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { logAnalytics } from "@/lib/analytics";

export type { ConductorIntent, ConductorPhase, ConductorRequest, ConductorResult } from "./types";

const CONDUCTOR_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR === "1";

export function isConductorEnabled(): boolean {
  return CONDUCTOR_ENABLED;
}

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
      return logConductor(request, {
        handled: true,
        phase: "execute",
        delegated: true,
        meta: {
          intent: request.intent,
          source: request.source,
          visionPipeline: request.intent === "photo_upload",
          barcodePipeline: request.intent === "barcode_scan",
        },
      });
    case "search_query":
    case "seller_submit":
    case "vehicle_lookup":
      return logConductor(request, {
        handled: true,
        phase: "execute",
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
  return executeConductorRoute(conductorAgentActionRequest(action, source));
}

/** Phase 3 — route + centralized analytics telemetry. */
export async function executeConductorRoute(
  request: ConductorRequest
): Promise<ConductorResult> {
  const result = await routeConductorRequest(request);
  if (CONDUCTOR_ENABLED) {
    logAnalytics("conductor_route", {
      intent: request.intent,
      source: request.source,
      phase: result.phase,
      handled: result.handled,
      delegated: result.delegated ?? true,
      visionPipeline: Boolean(result.meta?.visionPipeline),
      barcodePipeline: Boolean(result.meta?.barcodePipeline),
    });
  }
  return result;
}

export function conductorUseVisionPipeline(result: ConductorResult): boolean {
  return Boolean(result.meta?.visionPipeline);
}

export function conductorUseBarcodePipeline(result: ConductorResult): boolean {
  return Boolean(result.meta?.barcodePipeline);
}

/** When false, conductor owns execution — caller must skip legacy path. */
export function conductorShouldDelegateLegacy(result: ConductorResult): boolean {
  return result.delegated !== false;
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

export function conductorWardrobeBulkSource(component: string): ConductorRequest {
  return {
    intent: "photo_upload",
    source: component,
    payload: { wardrobeBulk: true },
  };
}

export function conductorVehicleLookupSource(component: string): ConductorRequest {
  return {
    intent: "vehicle_lookup",
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
export {
  buildConductorPublishSnapshot,
  enrichListingWithConductorMeta,
  resolveConductorRequiresReview,
  resolveListingRequiresReview,
} from "./conductor-publish";
export type { ConductorPublishSnapshot } from "./conductor-publish";
export {
  CONDUCTOR_MERGED_AT_ATTR,
  CONDUCTOR_SOURCES_ATTR,
} from "./conductor-publish";
export { mergeListingDraft, mergeBarcodeLookupDraft, mergeVehicleLookupDraft } from "./unified-draft";
export type { UnifiedDraftSource, UnifiedListingDraft } from "./unified-draft";
