/**
 * VAUTO AI Core v2 — production Gemini reasoning provider.
 *
 * Gemini emits semantic claims, never StatePatch operations or canonical keys.
 * Deterministic claim mapping and the existing authority/state loop own
 * executable state construction.
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
import {
  ProviderFailureError,
  isRetryableFailure,
  type ProviderFailureCode,
} from "./provider-errors.js";

export { CORE_V2_MODEL, ProviderFailureError, isRetryableFailure };
export type { ProviderFailureCode };

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
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
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
