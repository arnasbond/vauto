/**
 * VAUTO AI Core v2 — bounded multi-step reasoning loop.
 *
 * The model is the semantic authority; tools are bounded READ capabilities.
 * The loop is bounded (no autonomous agent): it lets the model reason, request
 * at most a couple of READ capabilities, receive grounded results, and produce
 * a final response. A capability result is NEVER the final answer — the model
 * interprets it.
 */
import type { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContext, CapabilityResult } from "../capability/capability.js";
import type { SearchListingsArgs } from "../capability/capabilities/search-listings.js";
import { validateReasoningDecision, MalformedReasoningDecisionError } from "../reasoning/reasoning-loop.js";
import type {
  GroundedCapabilityResult,
  ReasoningDecision,
  ReasoningInput,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import { applyStatePatches } from "../state/state-transitions.js";
import {
  executionEligibleHardConstraints,
  executionEligibleSearchSubject,
  type MarketplaceState,
} from "../state/marketplace-state.js";

export const DEFAULT_MAX_ITERATIONS = 3;

export interface MultiStepLoopOptions {
  provider: ReasoningProvider;
  registry: CapabilityRegistry;
  input: ReasoningInput;
  maxIterations?: number;
  onEvent?: (e: LoopEvent) => void;
}

export type LoopEvent =
  | { type: "reasoning"; iteration: number }
  | { type: "capability"; name: string; ok: boolean; error?: string }
  | { type: "bound_reached"; iterations: number };

export interface CapabilityCallRecord {
  name: string;
  ok: boolean;
  error?: string;
}

export interface MultiStepLoopResult {
  /** The final reasoning decision (may be empty if the bound was reached). */
  decision: ReasoningDecision;
  finalState: MarketplaceState;
  iterations: number;
  capabilityCalls: CapabilityCallRecord[];
}

/**
 * Derive execution-safe search arguments. Hard DB filters come ONLY from
 * execution-eligible (USER_STATED) state; the free-text query comes ONLY from
 * a USER_STATED search subject. The model's capability-request args (including
 * any invented `query`) are IGNORED as retrieval authority — reasoning is
 * free, execution authority is not.
 */
export function deriveSearchListingsArgs(
  state: MarketplaceState,
  _modelArgs: unknown
): SearchListingsArgs {
  const eligible = executionEligibleHardConstraints(state);
  return {
    query: executionEligibleSearchSubject(state),
    category: eligible.category,
    city: eligible.location,
    minPrice: eligible.priceMin,
    maxPrice: eligible.priceMax,
  };
}

function summarizeResult(capability: string, result: CapabilityResult<unknown>): GroundedCapabilityResult {
  if (!result.ok) {
    return { capability, ok: false, error: result.error ?? "capability failed" };
  }
  const d = result.data as { count?: number; listings?: Array<{ title: string }>; title?: string; price?: number } | undefined;
  if (capability === "searchListings" && d) {
    const titles = (d.listings ?? []).slice(0, 5).map((l) => l.title).join("; ");
    return {
      capability,
      ok: true,
      summary: `rasta ${d.count ?? 0} skelbimų${titles ? `: ${titles}` : ""}`,
    };
  }
  if (capability === "listingDetails" && d) {
    return { capability, ok: true, summary: `${d.title ?? ""} (${d.price ?? "?"} €)` };
  }
  return { capability, ok: true, summary: "ok" };
}

export async function runMultiStepLoop(opts: MultiStepLoopOptions): Promise<MultiStepLoopResult> {
  const max = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  let state = opts.input.state;
  const groundedResults: GroundedCapabilityResult[] = [];
  const capabilityCalls: CapabilityCallRecord[] = [];
  let decision: ReasoningDecision = {};

  for (let i = 0; i < max; i++) {
    opts.onEvent?.({ type: "reasoning", iteration: i + 1 });
    decision = (await opts.provider({ ...opts.input, state, groundedResults })) ?? {};
    try {
      validateReasoningDecision(decision);
    } catch (e) {
      if (e instanceof MalformedReasoningDecisionError) throw e;
      throw e;
    }

    if (decision.statePatches?.length) {
      state = applyStatePatches(state, decision.statePatches);
    }

    if (!decision.capabilityRequest) {
      return { decision, finalState: state, iterations: i + 1, capabilityCalls };
    }

    const req = decision.capabilityRequest;
    const contract = opts.registry.get(req.capability);
    if (!contract) {
      capabilityCalls.push({ name: req.capability, ok: false, error: "unknown_capability" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "unknown_capability" });
      return { decision, finalState: state, iterations: i + 1, capabilityCalls };
    }
    if (contract.consequence !== "READ") {
      capabilityCalls.push({ name: req.capability, ok: false, error: "not_read_only" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "not_read_only" });
      return { decision, finalState: state, iterations: i + 1, capabilityCalls };
    }

    // Execution-safe args: search filters derive from USER_INTENT state only.
    const execArgs =
      req.capability === "searchListings"
        ? deriveSearchListingsArgs(state, req.args)
        : contract.validate(req.args);

    let result: CapabilityResult<unknown>;
    try {
      result = await contract.execute(execArgs as never, {} as CapabilityContext);
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : "capability error" };
    }
    capabilityCalls.push({ name: req.capability, ok: result.ok, error: result.error });
    opts.onEvent?.({
      type: "capability",
      name: req.capability,
      ok: result.ok,
      error: result.error,
    });
    groundedResults.push(summarizeResult(req.capability, result));
  }

  opts.onEvent?.({ type: "bound_reached", iterations: max });
  return { decision, finalState: state, iterations: max, capabilityCalls };
}
