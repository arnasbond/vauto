/**
 * VAUTO AI Core v2 — reasoning contract (composable).
 *
 * ONE authoritative reasoning boundary. A single decision may carry several
 * non-exclusive outcomes at once: a visible response, state patches,
 * an unresolved question, and at most one capability request — matching how
 * a human naturally expresses a mixed marketplace goal. There is NO intent
 * enum and NO workflow DSL; an empty decision is a valid no-tool turn.
 */
import type { CapabilityDescription } from "../capability/capability.js";
import type { MarketplaceState } from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";

export type { StatePatch };

export interface ReasoningHistoryEntry {
  role: "user" | "assistant";
  text: string;
}

export interface ReasoningInput {
  userTurn: string;
  history: ReasoningHistoryEntry[];
  state: MarketplaceState;
  capabilities: CapabilityDescription[];
}

export interface CapabilityRequestShape {
  capability: string;
  args: unknown;
}

/**
 * A single composable reasoning decision. All fields optional; at most one
 * capability request per decision. An empty decision is a deliberate no-tool
 * turn.
 */
export interface ReasoningDecision {
  text?: string;
  statePatches?: StatePatch[];
  capabilityRequest?: CapabilityRequestShape;
  clarification?: string;
}

/** The model-facing reasoning provider (real LLM integration is a later package). */
export type ReasoningProvider = (
  input: ReasoningInput
) => Promise<ReasoningDecision | null | undefined>;
