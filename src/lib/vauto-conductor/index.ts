import type {
  ConductorRequest,
  ConductorResult,
  ConductorBarcodeExecuteMeta,
  ConductorVehicleExecuteMeta,
  ConductorVisionExecuteMeta,
  ConductorVisionExtractInput,
} from "./types";
import { conductorAgentActionRequest } from "./agent-actions";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { logAnalytics } from "@/lib/analytics";
import { conductorRelease, conductorTryAcquire } from "./conductor-busy-gate";
import {
  executeConductorBarcodeLookup,
  executeConductorVehicleLookup,
  executeConductorVisionExtract,
} from "./conductor-execute";
import type { ListingCategory } from "@/lib/types";

export type {
  ConductorIntent,
  ConductorPhase,
  ConductorRequest,
  ConductorResult,
  ConductorBarcodeExecuteMeta,
  ConductorVehicleExecuteMeta,
  ConductorVisionExecuteMeta,
  ConductorVisionExtractInput,
  ConductorVisionMode,
} from "./types";

function readVisionExtractInput(
  payload: Record<string, unknown> | undefined
): ConductorVisionExtractInput | null {
  const mode = payload?.mode;
  if (mode !== "upload" && mode !== "combined") return null;
  const hasImage = Boolean(
    payload?.imageDataUrl ||
      (Array.isArray(payload?.imageDataUrls) && payload.imageDataUrls.length > 0)
  );
  if (!hasImage) return null;
  return {
    mode,
    imageDataUrl:
      typeof payload?.imageDataUrl === "string" ? payload.imageDataUrl : null,
    imageDataUrls: Array.isArray(payload?.imageDataUrls)
      ? payload.imageDataUrls.filter((u): u is string => typeof u === "string")
      : undefined,
    transcript: typeof payload?.transcript === "string" ? payload.transcript : undefined,
    extraContext: typeof payload?.extraContext === "string" ? payload.extraContext : undefined,
    userCity: typeof payload?.userCity === "string" ? payload.userCity : "Lietuva",
    contact: typeof payload?.contact === "string" ? payload.contact : "",
    recoveryRetry: Boolean(payload?.recoveryRetry),
  };
}

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
    case "barcode_scan": {
      const barcode = typeof request.payload?.barcode === "string" ? request.payload.barcode.trim() : "";
      const category =
        (typeof request.payload?.category === "string"
          ? request.payload.category
          : "other") as ListingCategory;
      if (!barcode) {
        return logConductor(request, {
          handled: true,
          phase: "execute",
          delegated: true,
          meta: { intent: request.intent, source: request.source, barcodePipeline: true },
        });
      }
      if (!conductorTryAcquire()) {
        return logConductor(request, {
          handled: false,
          phase: "route",
          delegated: true,
          meta: { conductorBusy: true, barcodePipeline: true },
        });
      }
      try {
        const barcodeExecute = await executeConductorBarcodeLookup(barcode, category);
        return logConductor(request, {
          handled: true,
          phase: "complete",
          delegated: false,
          meta: {
            intent: request.intent,
            source: request.source,
            barcodePipeline: true,
            barcodeExecute,
          },
        });
      } finally {
        conductorRelease();
      }
    }
    case "vehicle_lookup": {
      const identifier =
        typeof request.payload?.identifier === "string" ? request.payload.identifier.trim() : "";
      if (!identifier) {
        return logConductor(request, {
          handled: true,
          phase: "execute",
          delegated: true,
          meta: { intent: request.intent, source: request.source },
        });
      }
      if (!conductorTryAcquire()) {
        return logConductor(request, {
          handled: false,
          phase: "route",
          delegated: true,
          meta: { conductorBusy: true },
        });
      }
      try {
        const vin = typeof request.payload?.vin === "string" ? request.payload.vin : undefined;
        const plate = typeof request.payload?.plate === "string" ? request.payload.plate : undefined;
        const vehicleExecute = await executeConductorVehicleLookup(identifier, { vin, plate });
        return logConductor(request, {
          handled: true,
          phase: "complete",
          delegated: false,
          meta: {
            intent: request.intent,
            source: request.source,
            vehicleExecute,
          },
        });
      } finally {
        conductorRelease();
      }
    }
    case "photo_upload": {
      const visionInput = readVisionExtractInput(request.payload);
      if (!visionInput) {
        return logConductor(request, {
          handled: true,
          phase: "execute",
          delegated: true,
          meta: {
            intent: request.intent,
            source: request.source,
            visionPipeline: true,
          },
        });
      }
      if (!conductorTryAcquire()) {
        return logConductor(request, {
          handled: false,
          phase: "route",
          delegated: true,
          meta: { conductorBusy: true, visionPipeline: true },
        });
      }
      try {
        const visionExecute = await executeConductorVisionExtract(visionInput);
        return logConductor(request, {
          handled: true,
          phase: "complete",
          delegated: false,
          meta: {
            intent: request.intent,
            source: request.source,
            visionPipeline: true,
            visionExecute,
          },
        });
      } catch (error) {
        return logConductor(request, {
          handled: false,
          phase: "fallback",
          delegated: true,
          meta: {
            intent: request.intent,
            source: request.source,
            visionPipeline: true,
            visionError: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        conductorRelease();
      }
    }
    case "search_query":
    case "seller_submit":
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
      executed: result.delegated === false,
      visionPipeline: Boolean(result.meta?.visionPipeline),
      barcodePipeline: Boolean(result.meta?.barcodePipeline),
      conductorBusy: Boolean(result.meta?.conductorBusy),
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

export function readConductorVehicleExecute(
  result: ConductorResult
): ConductorVehicleExecuteMeta | null {
  const meta = result.meta?.vehicleExecute;
  if (!meta || typeof meta !== "object") return null;
  return meta as ConductorVehicleExecuteMeta;
}

export function readConductorBarcodeExecute(
  result: ConductorResult
): ConductorBarcodeExecuteMeta | null {
  const meta = result.meta?.barcodeExecute;
  if (!meta || typeof meta !== "object") return null;
  return meta as ConductorBarcodeExecuteMeta;
}

export function readConductorVisionExecute(
  result: ConductorResult
): ConductorVisionExecuteMeta | null {
  const meta = result.meta?.visionExecute;
  if (!meta || typeof meta !== "object") return null;
  return meta as ConductorVisionExecuteMeta;
}

export {
  conductorIsBusy,
  conductorSetAgentBusy,
  conductorTryAcquire,
  conductorRelease,
} from "./conductor-busy-gate";

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
