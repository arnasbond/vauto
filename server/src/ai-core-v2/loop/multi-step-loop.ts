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
import {
  searchListingsCapability,
  type SearchListingsArgs,
} from "../capability/capabilities/search-listings.js";
import { validateReasoningDecision, MalformedReasoningDecisionError } from "../reasoning/reasoning-loop.js";
import type {
  GroundedCapabilityResult,
  ReasoningDecision,
  ReasoningInput,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import { applyStatePatches } from "../state/state-transitions.js";
import { groundStatePatches } from "./grounding.js";
import type { AuthorityVerifier } from "./authority-verifier.js";
import { deterministicAuthorityVerifier } from "./authority-verifier.js";
import {
  executionEligibleHardConstraints,
  executionEligibleSearchSubject,
  type MarketplaceState,
} from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";
import { CORE_V2_TURN_BUDGET_MS } from "../provider/model-config.js";

export const DEFAULT_MAX_ITERATIONS = 3;

/**
 * Raised when the TOTAL per-turn wall-clock budget is exhausted. A per-attempt
 * provider timeout is NOT sufficient: this aborts further provider attempts,
 * verifier calls, and loop iterations, and classifies the turn truthfully
 * (never a fabricated semantic response).
 */
export class TurnBudgetExceededError extends Error {
  readonly code = "turn_budget_exceeded";
  constructor(message: string) {
    super(message);
    this.name = "TurnBudgetExceededError";
  }
}

export interface MultiStepLoopOptions {
  provider: ReasoningProvider;
  registry: CapabilityRegistry;
  input: ReasoningInput;
  maxIterations?: number;
  /** Total per-turn wall-clock budget (ms). Defaults to CORE_V2_TURN_BUDGET_MS. */
  turnBudgetMs?: number;
  onEvent?: (e: LoopEvent) => void;
  /** Narrow authority verifier for USER_STATED grounding (default: continuity-only). */
  authorityVerifier?: AuthorityVerifier;
  /** Capability execution context (authenticated user + HITL confirmation flag). */
  capabilityContext?: CapabilityContext;
  diagnosticContext?: { threadId?: string; turnId?: string };
}

export type LoopEvent =
  | { type: "reasoning"; iteration: number }
  | { type: "capability"; name: string; ok: boolean; error?: string }
  | { type: "bound_reached"; iterations: number };

export interface CapabilityCallRecord {
  name: string;
  ok: boolean;
  error?: string;
  /** Raw grounded capability result data (for cross-turn result continuity). */
  data?: unknown;
}

export interface MultiStepLoopResult {
  /** The final reasoning decision (may be empty if the bound was reached). */
  decision: ReasoningDecision;
  finalState: MarketplaceState;
  iterations: number;
  capabilityCalls: CapabilityCallRecord[];
  /** USER_STATED claims the grounding layer rejected (demoted to MODEL_INFERENCE). */
  rejectedAuthority: Array<{ patch: StatePatch; reason: string }>;
  /** Every proposed patch across all loop iterations (pre-grounding). */
  allProposedPatches: StatePatch[];
}

/**
 * Derive execution-safe search arguments.
 * Model capabilityRequest.args are validated and canonicalized via searchListingsCapability.validate().
 * Explicit capability arguments take precedence; omitted fields inherit from authoritative state.
 */
export function deriveSearchListingsArgs(
  state: MarketplaceState,
  modelArgs: unknown
): SearchListingsArgs {
  const eligible = executionEligibleHardConstraints(state);
  const eligibleSubject = executionEligibleSearchSubject(state);

  let validated: Partial<SearchListingsArgs> = {};
  if (modelArgs && typeof modelArgs === "object" && !Array.isArray(modelArgs)) {
    try {
      validated = searchListingsCapability.validate(modelArgs);
    } catch {
      validated = {};
    }
  }

  let maxPrice: number | undefined;
  if (eligible.priceMax !== undefined && validated.maxPrice !== undefined) {
    maxPrice = Math.min(eligible.priceMax, validated.maxPrice);
  } else {
    maxPrice = validated.maxPrice ?? eligible.priceMax;
  }

  let minPrice: number | undefined;
  if (eligible.priceMin !== undefined && validated.minPrice !== undefined) {
    minPrice = Math.max(eligible.priceMin, validated.minPrice);
  } else {
    minPrice = validated.minPrice ?? eligible.priceMin;
  }

  const category = eligible.category ?? validated.category;
  const city = eligible.location ?? validated.city;
  const query = eligibleSubject ?? validated.query;

  return {
    query,
    category,
    city,
    minPrice,
    maxPrice,
    limit: validated.limit,
  };
}

function summarizeResult(capability: string, result: CapabilityResult<unknown>): GroundedCapabilityResult {
  if (!result.ok) {
    return {
      capability,
      ok: false,
      error: result.error ?? "capability failed",
      failureKind: result.failureKind,
    };
  }
  const d = result.data as { count?: number; listings?: Array<{ title: string }>; title?: string; price?: number } | undefined;
  if (capability === "searchListings" && d) {
    const titles = (d.listings ?? []).slice(0, 5).map((l) => l.title).join("; ");
    return {
      capability,
      ok: true,
      summary: `rasta ${d.count ?? 0} skelbimų${titles ? `: ${titles}` : ""}`,
      provenance: result.provenance ?? "TOOL_DERIVED",
    };
  }
  if (capability === "listingDetails" && d) {
    return {
      capability,
      ok: true,
      summary: `${d.title ?? ""} (${d.price ?? "?"} €)`,
      provenance: result.provenance ?? "TOOL_DERIVED",
    };
  }
  return {
    capability,
    ok: true,
    summary: "ok",
    provenance: result.provenance ?? "TOOL_DERIVED",
  };
}

/**
 * Bound an awaited sub-step by the REMAINING turn budget. If the budget is
 * already exhausted, or the sub-step outlives it, raise TurnBudgetExceededError
 * (truthful budget exhaustion, never a fabricated success).
 */
export function withinBudget<T>(p: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) {
    return Promise.reject(new TurnBudgetExceededError("turn budget exhausted"));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new TurnBudgetExceededError("turn budget exhausted"));
      }
    }, remainingMs);
    p.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(e);
        }
      }
    );
  });
}

export async function runMultiStepLoop(opts: MultiStepLoopOptions): Promise<MultiStepLoopResult> {
  const max = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const turnBudgetMs = opts.turnBudgetMs ?? CORE_V2_TURN_BUDGET_MS;
  const deadline = Date.now() + turnBudgetMs;
  let state = opts.input.state;
  const groundedResults: GroundedCapabilityResult[] = [];
  const capabilityCalls: CapabilityCallRecord[] = [];
  const rejectedAuthority: MultiStepLoopResult["rejectedAuthority"] = [];
  const allProposedPatches: StatePatch[] = [];
  const executedCallKeys = new Set<string>();
  let decision: ReasoningDecision = {};
  let iterationsExecuted = 0;

  for (let i = 0; i < max; i++) {
    iterationsExecuted = i + 1;
    opts.onEvent?.({ type: "reasoning", iteration: i + 1 });
    const reasoningStartedAt = Date.now();
    try {
      decision =
        (await withinBudget(opts.provider({ ...opts.input, state, groundedResults }), deadline - Date.now())) ?? {};
      console.warn("[core-v2-latency] reasoning_iteration", {
        ...opts.diagnosticContext,
        iteration: i + 1,
        elapsedMs: Date.now() - reasoningStartedAt,
        outcome: "success",
      });
    } catch (error) {
      console.warn("[core-v2-latency] reasoning_iteration", {
        ...opts.diagnosticContext,
        iteration: i + 1,
        elapsedMs: Date.now() - reasoningStartedAt,
        outcome: error instanceof TurnBudgetExceededError ? "turn_budget_exceeded" : "error",
      });
      throw error;
    }
    try {
      validateReasoningDecision(decision);
    } catch (e) {
      if (e instanceof MalformedReasoningDecisionError) throw e;
      throw e;
    }

    if (decision.statePatches?.length) {
      allProposedPatches.push(...decision.statePatches);
      // Ground before applying: the model cannot self-grant USER_STATED authority.
      const grounded = await withinBudget(
        groundStatePatches(
          state,
          decision.statePatches,
          opts.input.userTurn,
          opts.authorityVerifier ?? deterministicAuthorityVerifier
        ),
        deadline - Date.now()
      );
      state = applyStatePatches(state, grounded.accepted);
      rejectedAuthority.push(...grounded.rejectedAuthority);
    }

    if (!decision.capabilityRequest) {
      return { decision, finalState: state, iterations: i + 1, capabilityCalls, rejectedAuthority, allProposedPatches };
    }

    const req = decision.capabilityRequest;
    const contract = opts.registry.get(req.capability);
    if (!contract) {
      capabilityCalls.push({ name: req.capability, ok: false, error: "unknown_capability" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "unknown_capability" });
      groundedResults.push({
        capability: req.capability,
        ok: false,
        error: "unknown_capability",
        failureKind: "unavailable",
      });
      if (i + 1 < max) continue;
      break;
    }

    const ctx: CapabilityContext = opts.capabilityContext ?? {};

    // Deterministic authority gate. READ + PREPARE execute in the loop; MUTATE
    // requires an authenticated actor; CONSEQUENTIAL is never auto-executed —
    // it surfaces the Human-in-the-Loop confirmation boundary instead.
    if (contract.operation === "CONSEQUENTIAL") {
      capabilityCalls.push({ name: req.capability, ok: false, error: "confirmation_required" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "confirmation_required" });
      groundedResults.push({
        capability: req.capability,
        ok: false,
        error: "confirmation_required",
        failureKind: "confirmation_required",
      });
      return { decision, finalState: state, iterations: i + 1, capabilityCalls, rejectedAuthority, allProposedPatches };
    }
    if (contract.operation === "MUTATE" && !ctx.authUserId) {
      capabilityCalls.push({ name: req.capability, ok: false, error: "authorization" });
      opts.onEvent?.({ type: "capability", name: req.capability, ok: false, error: "authorization" });
      groundedResults.push({
        capability: req.capability,
        ok: false,
        error: "authorization",
        failureKind: "authorization",
      });
      return { decision, finalState: state, iterations: i + 1, capabilityCalls, rejectedAuthority, allProposedPatches };
    }

    // Execution-safe args: search filters derive from USER_INTENT state only.
    const execArgs =
      req.capability === "searchListings"
        ? deriveSearchListingsArgs(state, req.args)
        : contract.validate(req.args);

    const execKey = `${req.capability}:${JSON.stringify(execArgs)}`;
    if (executedCallKeys.has(execKey)) {
      console.warn("[core-v2-loop] duplicate capability execution skipped", {
        capability: req.capability,
        execKey,
      });
      break;
    }
    executedCallKeys.add(execKey);

    let result: CapabilityResult<unknown>;
    const capabilityStartedAt = Date.now();
    try {
      result = await withinBudget(
        contract.execute(execArgs as never, ctx),
        deadline - Date.now()
      );
    } catch (err) {
      if (err instanceof TurnBudgetExceededError) throw err;
      result = { ok: false, error: err instanceof Error ? err.message : "capability error" };
    }
    console.warn("[core-v2-latency] capability", {
      ...opts.diagnosticContext,
      name: req.capability,
      elapsedMs: Date.now() - capabilityStartedAt,
      outcome: result.ok ? "success" : "failure",
    });
    capabilityCalls.push({ name: req.capability, ok: result.ok, error: result.error, data: result.data });
    opts.onEvent?.({
      type: "capability",
      name: req.capability,
      ok: result.ok,
      error: result.error,
    });
    groundedResults.push(summarizeResult(req.capability, result));
  }

  // Final Grounded-Result Interpretation Pass:
  // If the loop finished after executing a READ capability without generating visible text,
  // allow the model a final reasoning pass to interpret grounded results into visible completion.
  const hasExecutedReadCapability = capabilityCalls.some((c) => c.ok);
  const decisionHasText = Boolean(decision.text?.trim() || decision.clarification?.trim());

  if (hasExecutedReadCapability && !decisionHasText && deadline - Date.now() > 50) {
    opts.onEvent?.({ type: "reasoning", iteration: iterationsExecuted + 1 });
    const interpStartedAt = Date.now();
    try {
      const interpDecision = await withinBudget(
        opts.provider({ ...opts.input, state, groundedResults }),
        deadline - Date.now()
      );
      if (interpDecision) {
        validateReasoningDecision(interpDecision);
        if (interpDecision.statePatches?.length) {
          allProposedPatches.push(...interpDecision.statePatches);
          const grounded = await withinBudget(
            groundStatePatches(
              state,
              interpDecision.statePatches,
              opts.input.userTurn,
              opts.authorityVerifier ?? deterministicAuthorityVerifier
            ),
            deadline - Date.now()
          );
          state = applyStatePatches(state, grounded.accepted);
          rejectedAuthority.push(...grounded.rejectedAuthority);
        }
        decision = {
          ...decision,
          text: interpDecision.text ?? decision.text,
          clarification: interpDecision.clarification ?? decision.clarification,
          statePatches: interpDecision.statePatches ?? decision.statePatches,
        };
      }
      console.warn("[core-v2-latency] reasoning_interpretation_pass", {
        ...opts.diagnosticContext,
        elapsedMs: Date.now() - interpStartedAt,
        outcome: "success",
      });
    } catch (err) {
      if (err instanceof TurnBudgetExceededError) throw err;
    }
  }

  opts.onEvent?.({ type: "bound_reached", iterations: iterationsExecuted });
  return { decision, finalState: state, iterations: iterationsExecuted, capabilityCalls, rejectedAuthority, allProposedPatches };
}
