/**
 * VAUTO AI Core v2.3 — internal semantic evaluation harness.
 *
 * Runs a natural-language scenario turn through the Core v2 loop and records
 * a factual trace (decision, proposed/verified/rejected state patches,
 * capability request, execution-safe args, capability result, iteration
 * count, failure). This is for SHADOW evaluation only — no production
 * routing, no mutation.
 */
import type { CapabilityRegistry } from "../capability/registry.js";
import { runMultiStepLoop, deriveSearchListingsArgs } from "../loop/multi-step-loop.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import type {
  ReasoningDecision,
  ReasoningHistoryEntry,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import type { MarketplaceState } from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";

export interface ScenarioRecord {
  turnId: string;
  userTurn: string;
  priorState: MarketplaceState;
  decision: ReasoningDecision;
  /** Patches proposed in the FINAL loop iteration only. */
  finalIterationProposedPatches: StatePatch[];
  /** Every proposed patch across all loop iterations (pre-grounding). */
  allProposedPatches: StatePatch[];
  rejectedAuthority: Array<{ patch: StatePatch; reason: string }>;
  capabilityRequested?: string;
  executionSafeArgs?: Record<string, unknown>;
  capabilityResult?: { ok: boolean; error?: string };
  finalResponse?: string;
  iterations: number;
  finalState: MarketplaceState;
  failure?: { code: string; reason: string };
}

export interface SemanticScenarioOptions {
  turnId: string;
  userTurn: string;
  history: ReasoningHistoryEntry[];
  priorState: MarketplaceState;
  provider: ReasoningProvider;
  registry: CapabilityRegistry;
  authorityVerifier?: AuthorityVerifier;
  capabilities: Array<{ name: string; description: string; consequence: "READ" }>;
}

export async function runSemanticScenario(
  opts: SemanticScenarioOptions
): Promise<ScenarioRecord> {
  try {
    const result = await runMultiStepLoop({
      provider: opts.provider,
      registry: opts.registry,
      input: {
        userTurn: opts.userTurn,
        history: opts.history,
        state: opts.priorState,
        capabilities: opts.capabilities,
      },
      authorityVerifier: opts.authorityVerifier,
    });

    const record: ScenarioRecord = {
      turnId: opts.turnId,
      userTurn: opts.userTurn,
      priorState: opts.priorState,
      decision: result.decision,
      finalIterationProposedPatches: result.decision.statePatches ?? [],
      allProposedPatches: result.allProposedPatches ?? [],
      rejectedAuthority: result.rejectedAuthority,
      capabilityRequested: result.decision.capabilityRequest?.capability,
      finalResponse: result.decision.text,
      iterations: result.iterations,
      finalState: result.finalState,
    };

    if (result.decision.capabilityRequest?.capability === "searchListings") {
      record.executionSafeArgs = deriveSearchListingsArgs(
        result.finalState,
        result.decision.capabilityRequest.args
      ) as unknown as Record<string, unknown>;
    }
    const call = result.capabilityCalls[0];
    if (call) record.capabilityResult = { ok: call.ok, error: call.error };

    return record;
  } catch (err) {
    return {
      turnId: opts.turnId,
      userTurn: opts.userTurn,
      priorState: opts.priorState,
      decision: {},
      finalIterationProposedPatches: [],
      allProposedPatches: [],
      rejectedAuthority: [],
      iterations: 0,
      finalState: opts.priorState,
      failure: {
        code: (err as { code?: string } | null)?.code ?? (err instanceof Error ? err.name : "unknown"),
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
