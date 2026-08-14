/**
 * VAUTO AI Foundation — public barrel (Etapas 10-FOUNDATION).
 * Additive infrastructure only; does not wire Intent Engine / marketplace flows.
 */

/** Semver for foundation contracts (telemetry, routers, policies). */
export { AI_FOUNDATION_VERSION } from "./version.js";

export {
  type AiTaskClass,
  type AiProviderId,
  type AiModelRoute,
  type ResolveAiModelOptions,
  resolveAiModel,
  getAiModel,
  inferProviderFromModel,
  listConfiguredAiModels,
} from "./model-router.js";

export {
  type AiTelemetryEvent,
  type RecordAiTelemetryInput,
  type AiTelemetrySink,
  AI_TELEMETRY_FORBIDDEN_KEYS,
  sanitizeAiTelemetryPayload,
  setAiTelemetrySink,
  recordAiTelemetry,
} from "./telemetry.js";

export {
  type AiQualitySample,
  type AiQualityMetrics,
  computeAiQualityMetrics,
  passesAiQualityGate,
} from "./quality.js";

export {
  type AiConfidenceTier,
  type AiConfidenceResult,
  AI_CONFIDENCE_HIGH_MIN,
  AI_CONFIDENCE_MEDIUM_MIN,
  clampConfidence,
  classifyConfidenceTier,
  applyConfidencePolicy,
} from "./confidence.js";

export {
  type ComparableLevel,
  type ComparableExpansionStep,
  type ComparableExpansionResult,
  type ExpandComparablesInput,
  COMPARABLE_EXPANSION_LADDER,
  resolveComparableExpansion,
  applyExpansionConfidencePenalty,
} from "./comparable-policy.js";

export {
  type DomainNormalizeResult,
  type NormalizedAttribute,
  normalizeLithuanianDomainText,
  normalizeAutomotiveText,
  normalizeCommerceText,
  normalizeLocationText,
  isVatInvoiceCue,
} from "./domain-normalizer/index.js";
