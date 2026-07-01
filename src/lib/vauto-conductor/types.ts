/** Conductor intent — single entry taxonomy (Phase 1+) */
export type ConductorIntent =
  | "chat"
  | "photo_upload"
  | "barcode_scan"
  | "seller_submit"
  | "vehicle_lookup"
  | "search_query";

export type ConductorPhase = "route" | "execute" | "fallback" | "complete";

export interface ConductorRequest {
  intent: ConductorIntent;
  source: string;
  payload?: Record<string, unknown>;
}

export interface ConductorResult {
  handled: boolean;
  phase: ConductorPhase;
  /** When false, caller should use legacy path */
  delegated?: boolean;
  meta?: Record<string, unknown>;
}

export interface ConductorVehicleExecuteMeta {
  identifier: string;
  lookupResult: import("@/lib/vehicle-intelligence/vehicle-lookup").VehicleLookupResult;
  patch: Partial<import("@/lib/types").AiExtractedListing>;
}

export interface ConductorBarcodeExecuteMeta {
  barcode: string;
  category: string;
  lookupResult: import("@/lib/product-intelligence/barcode-lookup").BarcodeLookupResult;
  patch: Partial<import("@/lib/types").AiExtractedListing>;
  notFoundInRegistry: boolean;
  mergedDraft: Partial<import("@/lib/types").AiExtractedListing>;
}

export type ConductorVisionMode = "upload" | "combined";

export interface ConductorVisionExtractInput {
  mode: ConductorVisionMode;
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
  transcript?: string;
  extraContext?: string;
  userCity: string;
  contact: string;
  recoveryRetry?: boolean;
}

export interface ConductorVisionExecuteMeta {
  mode: ConductorVisionMode;
  extracted: import("@/lib/types").AiExtractedListing;
  locationHint: string;
}

export type ConductorTextMode = "text" | "voice";

export interface ConductorTextExtractInput {
  mode: ConductorTextMode;
  transcript: string;
  extraContext?: string;
  userCity: string;
  contact: string;
  recoveryRetry?: boolean;
}

export interface ConductorTextExecuteMeta {
  mode: ConductorTextMode;
  extracted: import("@/lib/types").AiExtractedListing;
  locationHint: string;
}

export interface ConductorSearchExecuteMeta {
  query: string;
  agentResult: import("@/lib/voice-intent-engine").WakeWordAgentResult;
}

export interface ConductorAgentExecuteMeta {
  actionType: string;
  action: import("@/lib/vauto-agent-client").VautoAgentAction;
  draftCommitted: boolean;
}
