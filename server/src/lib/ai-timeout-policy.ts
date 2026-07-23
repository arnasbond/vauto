/**
 * Server mirror of client ai-timeout-policy.ts — keep values in sync.
 */

export const AI_TIMEOUT_POLICY = {
  processingMs: 120_000,
  fetchMs: 12_000,
  visionFetchMs: 120_000,
  streamVisionMs: 180_000,
  barcodeLookupMs: 5_000,
  mockMs: 5_000,
  recoveryMs: 90_000,
  agentMs: 120_000,
  agentAdminMs: 150_000,
  searchStreamMs: 90_000,
  searchSqlMs: 1_500,
} as const;

export const BARCODE_LOOKUP_BUDGET_MS = AI_TIMEOUT_POLICY.barcodeLookupMs;
export const GEMINI_AGENT_TIMEOUT_MS = AI_TIMEOUT_POLICY.agentMs;
export const GEMINI_VISION_FETCH_TIMEOUT_MS = AI_TIMEOUT_POLICY.visionFetchMs;
export const SEARCH_SQL_TIMEOUT_MS = AI_TIMEOUT_POLICY.searchSqlMs;
