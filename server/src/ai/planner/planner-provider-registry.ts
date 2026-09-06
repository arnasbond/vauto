/**
 * E2.3 — PROVIDER REGISTRY / ROUTER for the planner adapter.
 *
 * Agent Core depends only on `PlannerLlmAdapter`. The registry resolves the
 * CONCRETE adapter from the provider routing config:
 *  - provider === "gemini"  → the Gemini adapter (Google endpoint);
 *  - any other provider WITHOUT an adapter → fail CLOSED
 *    (PlannerProviderUnavailableError) — a non-Gemini model is NEVER sent
 *    to the Google endpoint.
 */
import { resolveAiModel } from "../foundation/model-router.js";
import { createGeminiPlannerAdapter } from "./planner-gemini-adapter.js";
import {
  PlannerProviderUnavailableError,
  type PlannerLlmAdapter,
} from "./planner-provider.js";

export interface PlannerRoute {
  provider: string;
  model: string;
}

export type PlannerRouteResolver = () => PlannerRoute;

export interface PlannerProviderRegistry {
  resolveAdapter(route: PlannerRoute): PlannerLlmAdapter;
}

/** Default production route — the VAUTO model router (FAST class), with the
 *  historical gemini-2.5-flash default when no explicit config exists. */
export function resolveDefaultPlannerRoute(): PlannerRoute {
  try {
    const route = resolveAiModel("FAST", { allowFallback: false });
    return { provider: route.provider, model: route.model };
  } catch {
    return { provider: "gemini", model: "gemini-2.5-flash" };
  }
}

/**
 * E2.3 — the production registry. Only provider families with a real
 * adapter map here; everything else fails closed (never mis-routed).
 */
export function createDefaultPlannerProviderRegistry(): PlannerProviderRegistry {
  const factories: Record<string, (model: string) => PlannerLlmAdapter> = {
    gemini: (model) => createGeminiPlannerAdapter(model),
  };
  return {
    resolveAdapter(route: PlannerRoute): PlannerLlmAdapter {
      const factory = factories[route.provider];
      if (!factory) {
        throw new PlannerProviderUnavailableError(
          `no planner adapter registered for provider "${route.provider}" (model "${route.model}")`
        );
      }
      return factory(route.model);
    },
  };
}
