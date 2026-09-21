/**
 * VAUTO AI Core v2.3R.1 — provider-neutral Arena types (hardened economics).
 *
 * A TASK is one user-level VAUTO objective/scenario. A REQUEST is any paid
 * model/provider/verifier call made to complete that task. All requests'
 * costs belong to the economic denominator of successful outcomes.
 */

import type { ReasoningDecision, ReasoningInput } from "../reasoning/reasoning-contract.js";
import type { MarketplaceState } from "../state/marketplace-state.js";

/** Normalized token/cost usage. Missing metrics are `null` (never fabricated). */
export interface NormalizedUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /** thinking/reasoning tokens, if the provider reports them. */
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  /** Provider-reported cost if available; otherwise null. */
  cost: number | null;
}

export const NO_USAGE: NormalizedUsage = {
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  cachedInputTokens: null,
  totalTokens: null,
  cost: null,
};

export type NormalizedErrorCode =
  | "timeout"
  | "http_error"
  | "malformed_json"
  | "schema_invalid"
  | "provider_unavailable"
  | "contract_error"
  | "transport_invalid"
  | "unknown";

export interface NormalizedError {
  code: NormalizedErrorCode;
  status?: number;
  retryable: boolean;
  /** Observability only: the exact validator/parse rejection reason, when known. */
  reason?: string;
}

/** Provider metadata (never credentials). */
export interface ProviderInfo {
  provider: string;
  model: string;
}

export interface ProviderResult {
  decision: ReasoningDecision | null;
  usage: NormalizedUsage;
  latencyMs: number;
  attempts: number;
  info: ProviderInfo;
  error?: NormalizedError;
}

/** The single provider-neutral reasoning boundary used by the Arena. */
export type ArenaProvider = (request: ReasoningInput) => Promise<ProviderResult>;

export type StructuralOutcome = "valid" | "schema_invalid" | "malformed" | "timeout" | "http";
export type ArenaOutcome = "PASS" | "SEMANTIC_FAIL" | "CONTRACT_FAIL" | "NOT_EVALUATED";

/** Whether a request incurred billable cost (per provider reporting). */
export type BillingStatus = "billed" | "not_billed" | "unknown";

export interface RequestCost {
  role: "reasoning" | "retry" | "verifier" | "fallback";
  usage: NormalizedUsage;
  billed: BillingStatus;
}

/** All requests (and their costs) that a task incurred. */
export interface TaskCost {
  requests: RequestCost[];
}

export interface ArenaRecord {
  provider: string;
  model: string;
  scenario: string;
  structural: StructuralOutcome;
  outcome: ArenaOutcome;
  /** Authority safety: no unverified value entered execution args, verifier fail-closed. */
  authorityOk: boolean;
  capabilityRequested?: string;
  capabilityAuthorized: boolean;
  executionSafeArgs: Record<string, unknown>;
  latencyMs: number;
  attempts: number;
  verifierCalls: number;
  cost: TaskCost;
  finalState: MarketplaceState;
}

/** Immutable price snapshot captured at benchmark time. */
export interface PriceSnapshot {
  provider: string;
  model: string;
  /** cost per input token */
  inputPrice: number | null;
  /** cost per output token */
  outputPrice: number | null;
  cachedInputPrice: number | null;
  reasoningPrice: number | null;
  currency: string;
  source: string;
  effectiveDate: string;
  capturedAt: string;
  /** Short-context pricing is valid only for prompts ≤ this many tokens. */
  shortContextMaxPromptTokens?: number;
  /** Long-context prices (null = unknown → cost invalid above threshold). */
  longContextInputPrice?: number | null;
  longContextOutputPrice?: number | null;
}

export interface ArenaSummary {
  semanticSuccessRate: number;
  contractReliability: number;
  authoritySafetyRate: number;
  timeoutRate: number;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  requestsPerTask: number | null;
  retriesPerSuccessfulTask: number | null;
  tokensPerAttemptedTask: number | null;
  tokensPerSuccessfulTask: number | null;
  knownCost: number | null;
  unknownCostRequestCount: number;
  costIncomplete: boolean;
  costPerRequest: number | null;
  costPerSuccessfulTask: number | null;
  costPer1000SuccessfulTasks: number | null;
}
