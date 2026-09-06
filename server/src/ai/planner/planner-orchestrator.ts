/**
 * E2.2 — planner orchestrator: LLM-first (provider-agnostic) with
 * deterministic fallback.
 *
 * Production flow:
 *   1. LLM planner through the typed adapter (default: Gemini adapter);
 *   2. provider-unavailable → deterministic fallback with AI-down semantics
 *      (obvious search / sell patch still work; unclear → honest dialog);
 *   3. structured-output failure → deterministic fallback (model assumed
 *      available — the tool loop keeps its own chance).
 *
 * The deterministic harness installs the deterministic planner as the
 * reference provider (same philosophy as the scripted model provider).
 */
import { llmPlannerDecision, setPlannerLlmTraceSink } from "./planner-llm.js";
import {
  PlannerProviderUnavailableError,
  type PlannerLlmAdapter,
} from "./planner-provider.js";
import {
  createDefaultPlannerProviderRegistry,
  resolveDefaultPlannerRoute,
  type PlannerProviderRegistry,
  type PlannerRouteResolver,
} from "./planner-provider-registry.js";
import { planTurn } from "./planner-engine.js";
import type { PlannerContextInput, PlannerDecision } from "./planner-types.js";

export type PlannerDecisionProvider = (
  input: PlannerContextInput
) => Promise<PlannerDecision>;

let plannerProviderForTests: PlannerDecisionProvider | null = null;
let plannerAdapterForTests: PlannerLlmAdapter | null = null;
let plannerRegistryForTests: PlannerProviderRegistry | null = null;
let plannerRouteResolverForTests: PlannerRouteResolver | null = null;
let plannerDecisionObserver: ((d: PlannerDecision, input: PlannerContextInput) => void) | null =
  null;

/**
 * E2.3 — the provider ROUTER decides the concrete adapter: the model route
 * (VAUTO model router, FAST class) → provider registry → adapter. Agent
 * Core only asks for the planner capability. A route whose provider has no
 * registered adapter fails CLOSED — a non-Gemini model is never sent to
 * the Google endpoint.
 */
export function resolvePlannerAdapter(): PlannerLlmAdapter {
  if (plannerAdapterForTests) return plannerAdapterForTests;
  const route = plannerRouteResolverForTests
    ? plannerRouteResolverForTests()
    : resolveDefaultPlannerRoute();
  const registry = plannerRegistryForTests ?? createDefaultPlannerProviderRegistry();
  return registry.resolveAdapter(route);
}

/** E2.2 — resolve the planning decision: LLM first, deterministic fallback. */
export async function resolvePlannerDecision(
  input: PlannerContextInput
): Promise<PlannerDecision> {
  let decision: PlannerDecision;
  if (plannerProviderForTests) {
    decision = await plannerProviderForTests(input);
  } else {
    try {
      decision = await llmPlannerDecision(input, resolvePlannerAdapter());
    } catch (err) {
      if (err instanceof PlannerProviderUnavailableError) {
        // AI-down: obvious deterministic capabilities keep working; unclear
        // intents get the HONEST unavailable dialog — never a search.
        console.warn(
          "[planner] provider unavailable — AI-down fallback:",
          err.message
        );
        decision = planTurn({ ...input, modelAvailable: false });
      } else {
        console.warn(
          "[planner] LLM planner failed — deterministic fallback:",
          err instanceof Error ? err.message : String(err)
        );
        decision = planTurn(input);
      }
    }
  }
  plannerDecisionObserver?.(decision, input);
  return decision;
}

/** Test-only seam — the deterministic harness installs the reference planner. */
export function setPlannerDecisionProviderForTests(
  provider: PlannerDecisionProvider | null
): void {
  plannerProviderForTests = provider;
}

/** Test-only seam — provider adapter swap (fake providers, no Agent Core change). */
export function setPlannerAdapterForTests(
  adapter: PlannerLlmAdapter | null
): void {
  plannerAdapterForTests = adapter;
}

/** Test-only seam — provider registry swap. */
export function setPlannerProviderRegistryForTests(
  registry: PlannerProviderRegistry | null
): void {
  plannerRegistryForTests = registry;
}

/** Test-only seam — model-route resolver swap. */
export function setPlannerRouteResolverForTests(
  resolver: PlannerRouteResolver | null
): void {
  plannerRouteResolverForTests = resolver;
}

/** Test-only observer — LIVE gate asserts the real PlannerDecision. */
export function setPlannerDecisionObserverForTests(
  observer: ((d: PlannerDecision, input: PlannerContextInput) => void) | null
): void {
  plannerDecisionObserver = observer;
}

/** Measurement-layer seam — the LIVE gate records the full per-turn
 *  production-path trace (raw provider decision → zod → clamps → final). */
export function setPlannerTraceObserverForTests(
  observer: import("./planner-llm.js").PlannerLlmTraceObserver | null
): void {
  setPlannerLlmTraceSink(observer);
}
