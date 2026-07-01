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
