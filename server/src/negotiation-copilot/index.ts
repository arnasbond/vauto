/**
 * Negotiation Copilot 1.0 — public exports.
 */

export {
  NEGOTIATION_COPILOT_VERSION,
  type NegotiationCopilotVersion,
} from "./version.js";

export {
  RECOMMENDATION_TYPES,
  SIGNAL_CODES,
  CopilotAuthError,
  CopilotNotFoundError,
  CopilotVersionConflictError,
  CopilotValidationError,
  type RecommendationType,
  type SignalCode,
  type ActorRole,
  type CopilotGoal,
  type NegotiationSignal,
  type DeterministicBounds,
  type CopilotContext,
  type CopilotRecommendation,
} from "./types.js";

export {
  RecommendBodySchema,
  DraftMessageBodySchema,
  CopilotRecommendationSchema,
  RecommendationTypeSchema,
} from "./schema.js";

export {
  buildDeterministicSignals,
  pickRecommendationType,
} from "./deterministic-signals.js";

export {
  explanationNumbersAreGrounded,
  scrubUngroundedNumbers,
  containsSecretBoundLeak,
  allowedNumberTokens,
} from "./explanation-guard.js";

export {
  CopilotContextLoader,
  type MarketScorePorts,
} from "./context-loader.js";

export {
  buildRecommendation,
  buildRecommendationAsync,
  copilotTelemetry,
  type LlmExplainer,
} from "./recommendation-engine.js";

export {
  NegotiationCopilotService,
  createNegotiationCopilotService,
} from "./copilot-service.js";
