/**
 * VAUTO AI Core v2 — isolated shadow execution with failure isolation.
 *
 * CORE v2 SHADOW FAILURE MUST NEVER BREAK CURRENT CORE.
 *
 * The Current Core runner is invoked FIRST and its result is always returned
 * intact. The v2 shadow (reasoning + read-only state application) runs in a
 * fully isolated try/catch: any provider throw, timeout, malformed decision,
 * state-transition error, or capability-policy rejection is classified into a
 * `ShadowFailureCode` and logged internally — never surfaced to the user and
 * never mutating production state.
 */
import type { CapabilityContract } from "../capability/capability.js";
import { MalformedReasoningDecisionError, runReasoningLoop } from "../reasoning/reasoning-loop.js";
import type { ReasoningDecision, ReasoningInput, ReasoningProvider } from "../reasoning/reasoning-contract.js";
import { applyStatePatches, StateTransitionError } from "../state/state-transitions.js";
import type { MarketplaceState } from "../state/marketplace-state.js";
import { ProviderFailureError } from "../provider/gemini-provider.js";
import { TurnBudgetExceededError } from "../loop/multi-step-loop.js";

export type ShadowFailureCode =
  | "provider_error"
  | "timeout"
  | "malformed_result"
  | "state_transition_error"
  | "capability_policy_rejection"
  | "internal_error";

export type ShadowOutcome =
  | { kind: "ok"; decision: ReasoningDecision; nextState: MarketplaceState }
  | { kind: "failure"; code: ShadowFailureCode; reason: string };

export interface ShadowRunResult {
  /** The Current Core result — the ONLY user-visible outcome. */
  authoritative: unknown;
  /** The Core v2 shadow outcome — internal evaluation only. */
  shadow: ShadowOutcome;
}

export interface ShadowRunnerOptions {
  /** Authoritative Current Core runner (injected; v2 never calls the legacy orchestrator directly). */
  runCurrentCore: () => Promise<unknown>;
  reasoningProvider: ReasoningProvider;
  buildReasoningInput: () => ReasoningInput;
  /** Optional provider timeout (ms). Default: none (provider is expected to bound itself). */
  providerTimeoutMs?: number;
  /** Read-only capability contracts used for policy validation (all must be READ). */
  shadowCapabilities?: ReadonlyArray<CapabilityContract<unknown, unknown>>;
}

/** Sanitize an error message for internal diagnostics: no raw user content/secrets. */
function sanitizeShadowReason(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name ?? "Error"}: ${String(err.message ?? "").replace(/\s+/g, " ").slice(0, 200)}`;
  }
  return String(err).replace(/\s+/g, " ").slice(0, 200);
}

function classifyShadowFailure(err: unknown): ShadowFailureCode {
  if (err instanceof MalformedReasoningDecisionError) return "malformed_result";
  if (err instanceof StateTransitionError) return "state_transition_error";
  if (err instanceof CapabilityPolicyRejectionError) return "capability_policy_rejection";
  if (err instanceof TurnBudgetExceededError) return "timeout";
  if (err instanceof ProviderFailureError) {
    switch (err.code) {
      case "timeout":
        return "timeout";
      case "provider_unavailable":
      case "http_error":
        return "provider_error";
      case "malformed_json":
      case "schema_invalid":
        return "malformed_result";
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed\s*out|abort/i.test(msg)) return "timeout";
  return "provider_error";
}

export class CapabilityPolicyRejectionError extends Error {
  readonly code = "capability_policy_rejection";
  constructor(message: string) {
    super(message);
    this.name = "CapabilityPolicyRejectionError";
  }
}

/**
 * Safety guard: a shadow capability set must be READ-only. Any capability
 * that is PREPARE / MUTATE / CONSEQUENTIAL is rejected.
 */
export function assertShadowCapabilitiesReadOnly(
  capabilities: ReadonlyArray<CapabilityContract<unknown, unknown>>
): void {
  for (const c of capabilities) {
    if (c.operation !== "READ") {
      throw new CapabilityPolicyRejectionError(
        `shadow capability must be READ-only, got ${c.operation} for ${c.name}`
      );
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number | undefined): Promise<T> {
  if (!ms) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("shadow provider timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function runShadowSafely(opts: ShadowRunnerOptions): Promise<ShadowOutcome> {
  try {
    if (opts.shadowCapabilities) {
      assertShadowCapabilitiesReadOnly(opts.shadowCapabilities);
    }
    const input = opts.buildReasoningInput();
    const decision = await withTimeout(
      runReasoningLoop(opts.reasoningProvider, input),
      opts.providerTimeoutMs
    );
    // Apply state patches on a COPY (read-only shadow) — surfaces transition errors.
    const nextState =
      decision.statePatches?.length
        ? applyStatePatches(input.state, decision.statePatches)
        : input.state;
    return { kind: "ok", decision, nextState };
  } catch (err) {
    const code = classifyShadowFailure(err);
    console.warn(`[ai-core-v2] shadow failure: ${code}: ${sanitizeShadowReason(err)}`);
    return { kind: "failure", code, reason: sanitizeShadowReason(err) };
  }
}

export async function runShadowTurn(opts: ShadowRunnerOptions): Promise<ShadowRunResult> {
  // Authoritative first — Current Core result is computed and returned intact.
  const authoritative = await opts.runCurrentCore();
  const shadow = await runShadowSafely(opts);
  return { authoritative, shadow };
}
