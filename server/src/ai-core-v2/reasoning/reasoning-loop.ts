/**
 * VAUTO AI Core v2 — the ONE reasoning-loop boundary (composable, legacy-free).
 *
 * Delegates reasoning to a provider, validates the composable decision shape,
 * and returns it. No regex, no intent enum, no forced tool, no fast-path.
 */
import type {
  ReasoningDecision,
  ReasoningInput,
  ReasoningProvider,
} from "./reasoning-contract.js";

/** A provider that never fails and never forces a tool — for shadow/tests. */
export const noopReasoningProvider: ReasoningProvider = async () => ({});

/**
 * Validate the shape of a reasoning decision. Throws a typed error on any
 * malformed field so the shadow harness can classify it as `malformed_result`.
 */
export function validateReasoningDecision(decision: ReasoningDecision): void {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new MalformedReasoningDecisionError("decision must be an object");
  }
  if (decision.text != null && typeof decision.text !== "string") {
    throw new MalformedReasoningDecisionError("text must be a string");
  }
  if (decision.clarification != null && typeof decision.clarification !== "string") {
    throw new MalformedReasoningDecisionError("clarification must be a string");
  }
  if (decision.statePatches != null) {
    if (!Array.isArray(decision.statePatches)) {
      throw new MalformedReasoningDecisionError("statePatches must be an array");
    }
    for (const p of decision.statePatches) {
      if (!p || typeof p !== "object" || typeof p.op !== "string") {
        throw new MalformedReasoningDecisionError("invalid state patch");
      }
    }
  }
  if (decision.capabilityRequest != null) {
    const r = decision.capabilityRequest;
    if (
      typeof r !== "object" ||
      typeof r.capability !== "string" ||
      !r.capability.trim()
    ) {
      throw new MalformedReasoningDecisionError("capabilityRequest requires a capability name");
    }
  }
}

export class MalformedReasoningDecisionError extends Error {
  readonly code = "malformed_result";
  constructor(message: string) {
    super(message);
    this.name = "MalformedReasoningDecisionError";
  }
}

export async function runReasoningLoop(
  provider: ReasoningProvider,
  input: ReasoningInput
): Promise<ReasoningDecision> {
  const decision = (await provider(input)) ?? {};
  validateReasoningDecision(decision);
  return decision;
}
