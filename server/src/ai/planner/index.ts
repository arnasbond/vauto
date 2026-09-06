/**
 * E2.1 — Planner Centralization, LLM-first.
 *
 * Primary reasoning: LLM (`llmPlannerDecision`) producing a typed,
 * schema-validated PlannerDecision.
 * Deterministic layer: policy/authority/validation/fallback — never the
 * primary natural-language reasoner.
 */
export {
  planTurn,
  detectSearchSession,
} from "./planner-engine.js";
export {
  resolvePlannerDecision,
  resolvePlannerAdapter,
  setPlannerDecisionProviderForTests,
  setPlannerAdapterForTests,
  setPlannerProviderRegistryForTests,
  setPlannerRouteResolverForTests,
  setPlannerDecisionObserverForTests,
  type PlannerDecisionProvider,
} from "./planner-orchestrator.js";
export {
  createDefaultPlannerProviderRegistry,
  resolveDefaultPlannerRoute,
  type PlannerProviderRegistry,
  type PlannerRoute,
  type PlannerRouteResolver,
} from "./planner-provider-registry.js";
export {
  llmPlannerDecision,
  buildPlannerStructuredRequest,
} from "./planner-llm.js";
export {
  PlannerProviderUnavailableError,
  PlannerStructuredOutputError,
  type PlannerLlmAdapter,
  type PlannerStructuredRequest,
  type PlannerStructuredResponse,
  type PlannerPromptParts,
} from "./planner-provider.js";
export { geminiPlannerAdapter, createGeminiPlannerAdapter } from "./planner-gemini-adapter.js";
export { buildPlannerContext, type PlannerContextBuilderInput } from "./planner-context-builder.js";
export {
  applyDeterministicClamps,
  deriveRoutingForIntent,
  PlannerDecisionSchema,
  PLANNER_TOOL_WHITELIST,
} from "./planner-policy.js";
export {
  executorSellCancelReply,
  executorSellPreviewReply,
  executorClarifyAmbiguousReply,
  executorFinancialDenyReply,
  executorUnauthPublishReply,
  executorAiDownReply,
  executorSparseSellQuestion,
} from "./planner-executor.js";
export type {
  PlannerDecision,
  PlannerIntent,
  PlannerRouting,
  PlannerContextInput,
  PlannerFactPatch,
} from "./planner-types.js";
