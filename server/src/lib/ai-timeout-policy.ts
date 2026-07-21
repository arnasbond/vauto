/**
 * Server mirror of client ai-timeout-policy.ts — keep values in sync.
 */

export const AI_TIMEOUT_POLICY = {
  processingMs: 28_000,
  fetchMs: 12_000,
  visionFetchMs: 40_000,
  barcodeLookupMs: 5_000,
  mockMs: 5_000,
  recoveryMs: 42_000,
  agentMs: 28_000,
  agentAdminMs: 45_000,
} as const;

export const BARCODE_LOOKUP_BUDGET_MS = AI_TIMEOUT_POLICY.barcodeLookupMs;
export const GEMINI_AGENT_TIMEOUT_MS = AI_TIMEOUT_POLICY.agentMs;
