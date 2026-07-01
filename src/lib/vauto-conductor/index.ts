import type { ConductorRequest, ConductorResult } from "./types";

export type { ConductorIntent, ConductorPhase, ConductorRequest, ConductorResult } from "./types";

const CONDUCTOR_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR === "1";

/**
 * VautoConductor — unified AI orchestration entry (Phase 1).
 * Phase 0: telemetry + passthrough; Phase 1+: route all entry points here.
 */
export async function routeConductorRequest(
  request: ConductorRequest
): Promise<ConductorResult> {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[VautoConductor]", request.intent, request.source, request.payload);
  }

  if (!CONDUCTOR_ENABLED) {
    return { handled: false, phase: "route", delegated: true };
  }

  // Phase 1: switch on intent and call unified handlers
  return { handled: false, phase: "route", delegated: true };
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
