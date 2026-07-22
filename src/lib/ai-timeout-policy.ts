/**
 * Single source of truth for AI / lookup timeout budgets (client).
 * Server mirror: server/src/lib/ai-timeout-policy.ts
 *
 * Policy: external lookups fail fast (5s); vision/agent get cold-start + multi-photo OCR budget.
 * Multi-image Vision (6 photos + passport OCR) routinely exceeds 40s — stream wait is ≥120s.
 */

export const AI_TIMEOUT_POLICY = {
  /** Seller extraction ceiling — UI must not freeze longer */
  processingMs: 120_000,
  /** Default /api/ai fetch budget */
  fetchMs: 12_000,
  /** Vision, photo-intent, vauto-agent client fetch (multi-photo + OCR headroom) */
  visionFetchMs: 120_000,
  /** SSE stream with pending images — upload + Gemini Vision OCR */
  streamVisionMs: 180_000,
  /** Barcode, vehicle open-data — fail fast, soft fallback */
  barcodeLookupMs: 5_000,
  /** Offline mock extract only */
  mockMs: 5_000,
  /** Conversational recovery retry */
  recoveryMs: 90_000,
  /** Gemini agent round-trip without heavy vision */
  agentMs: 120_000,
  /** Admin-heavy agent context */
  agentAdminMs: 150_000,
} satisfies {
  processingMs: number;
  fetchMs: number;
  visionFetchMs: number;
  streamVisionMs: number;
  barcodeLookupMs: number;
  mockMs: number;
  recoveryMs: number;
  agentMs: number;
  agentAdminMs: number;
};

export type AiTimeoutPolicy = typeof AI_TIMEOUT_POLICY;

/** Photo scan overlay: vision handoff waits for full pipeline; barcode-only stays fast */
export function scanOverlayTimeoutMs(hasVisionHandoff: boolean): number {
  return hasVisionHandoff
    ? AI_TIMEOUT_POLICY.visionFetchMs
    : AI_TIMEOUT_POLICY.barcodeLookupMs;
}

/** Race helper for lookup hooks */
export function lookupRaceTimeoutMs(): number {
  return AI_TIMEOUT_POLICY.barcodeLookupMs;
}
