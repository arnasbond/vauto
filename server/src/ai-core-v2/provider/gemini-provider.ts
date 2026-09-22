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
} from "./semantic-claim.js";
import {
  ProviderFailureError,
  isRetryableFailure,
  type ProviderFailureCode,
} from "./provider-errors.js";
import {
  CORE_V2_MAX_REASONING_ATTEMPTS,
  CORE_V2_MODEL,
  CORE_V2_REASONING_TIMEOUT_MS,
} from "./model-config.js";

export { CORE_V2_MODEL, ProviderFailureError, isRetryableFailure };
export type { ProviderFailureCode };

export interface ReasoningAttemptTelemetry {
  attempt: number;
  elapsedMs: number;
  timedOut: boolean;
  status?: number;
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

export function createGeminiReasoningProvider(
  opts: GeminiReasoningProviderOptions = {}
): ReasoningProvider {
  return async (input: ReasoningInput): Promise<ReasoningDecision> => {
    const decision = await createGeminiSemanticClaimProvider({
      model: opts.model ?? CORE_V2_MODEL,
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs ?? CORE_V2_REASONING_TIMEOUT_MS,
      maxAttempts: opts.maxAttempts ?? CORE_V2_MAX_REASONING_ATTEMPTS,
      onAttempt: (attempt) =>
        (() => {
          const outcome = attempt.timedOut
            ? "timeout"
            : attempt.status && attempt.status >= 400
              ? "http_error"
              : attempt.claimCount == null
                ? "empty_or_parse_failure"
                : "success";
          opts.onAttempt?.({
            attempt: attempt.attempt,
            elapsedMs: attempt.elapsedMs,
            timedOut: attempt.timedOut,
            status: attempt.status,
            parseOutcome: attempt.claimCount == null ? undefined : "ok",
          });
        })(),
    })(input);
    return semanticDecisionToReasoningDecision(decision);
  };
}
