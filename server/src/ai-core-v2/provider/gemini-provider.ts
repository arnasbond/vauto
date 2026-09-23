/**
 * VAUTO AI Core v2 — production Gemini reasoning provider.
 *
 * Delegates to single authoritative SemanticClaim transport and deterministic
 * claimsToPatches mapper. Model emits typed semantic claims, not internal state
 * patch mechanics.
 */
import type {
  ReasoningInput,
  ReasoningDecision,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import {
  createGeminiSemanticClaimProvider,
  semanticDecisionToReasoningDecision,
  buildR3UserPrompt,
  R3_SYSTEM_INSTRUCTION,
} from "./semantic-claim.js";
import { CORE_V2_MODEL } from "./model-config.js";

export { CORE_V2_MODEL };

export type ProviderFailureCode =
  | "provider_unavailable"
  | "http_error"
  | "timeout"
  | "malformed_json"
  | "schema_invalid";

/** Typed provider failure so the shadow harness can classify cleanly. */
export class ProviderFailureError extends Error {
  readonly code: ProviderFailureCode;
  readonly status?: number;
  constructor(code: ProviderFailureCode, message: string, status?: number) {
    super(message);
    this.name = "ProviderFailureError";
    this.code = code;
    this.status = status;
  }
}

/** A transient failure worth a bounded retry (timeout / 5xx / rate-limit / network). */
export function isRetryableFailure(err: unknown): boolean {
  if (!(err instanceof ProviderFailureError)) return false;
  if (err.code === "timeout") return true;
  if (err.code === "http_error") {
    if (err.status === 429) return true;
    if (err.status != null && err.status >= 500) return true;
    // No HTTP status: the fetch threw before a response (network/DNS/reset) —
    // transient, bounded retry has value and is still capped by the turn budget.
    if (err.status == null) return true;
    return false;
  }
  return false;
}

export function buildReasoningRequest(input: ReasoningInput): {
  systemInstruction: string;
  userPrompt: string;
} {
  return {
    systemInstruction: R3_SYSTEM_INSTRUCTION,
    userPrompt: buildR3UserPrompt(input),
  };
}

export interface ReasoningAttemptTelemetry {
  attempt: number;
  elapsedMs: number;
  timedOut: boolean;
  status?: number;
  candidateCount?: number;
  finishReason?: string;
  blockReason?: string;
  parseOutcome?: "ok" | "empty" | "malformed_json" | "schema_invalid";
  capabilityRequested?: string;
}

export interface GeminiReasoningProviderOptions {
  model?: string;
  /** Overridable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Provider timeout (ms). */
  timeoutMs?: number;
  /** Bounded retry count for safe, idempotent READ reasoning. */
  maxAttempts?: number;
  /** Sanitized per-attempt observability (never the credential or raw body). */
  onAttempt?: (t: ReasoningAttemptTelemetry) => void;
}

/**
 * Production Gemini Reasoning Provider.
 *
 * Promoted to single authoritative SemanticClaim transport.
 * Model emits semantic claims; deterministic semanticDecisionToReasoningDecision
 * / claimsToPatches remains responsible for internal canonical state representation.
 */
export function createGeminiReasoningProvider(
  opts: GeminiReasoningProviderOptions = {}
): ReasoningProvider {
  const semanticProvider = createGeminiSemanticClaimProvider({
    model: opts.model,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
    maxAttempts: opts.maxAttempts,
    onAttempt: opts.onAttempt
      ? (t) =>
          opts.onAttempt?.({
            attempt: t.attempt,
            elapsedMs: t.elapsedMs,
            timedOut: t.timedOut,
            status: t.status,
            finishReason: t.finishReason,
            blockReason: t.blockReason,
            candidateCount: t.candidateCount,
            parseOutcome: t.parseOutcome ?? (t.timedOut ? undefined : "ok"),
            capabilityRequested: t.capabilityRequested,
          })
      : undefined,
  });

  return async (input: ReasoningInput): Promise<ReasoningDecision> => {
    const semanticDecision = await semanticProvider(input);
    return semanticDecisionToReasoningDecision(semanticDecision);
  };
}
