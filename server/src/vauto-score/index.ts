export { VAUTO_SCORE_VERSION } from "./version.js";
export {
  SCORE_WEIGHTS,
  REASON_CODE_ALLOWLIST,
  REASON_CODE_SET,
  isAllowedReasonCode,
  type ReasonCode,
  type ScoreComponent,
  type VautoScoreInput,
  type ListingQualityInput,
  type SellerTrustInput,
  type DemandInput,
  type DemandEvent,
  type TransactionConfidenceInput,
} from "./types.js";
export {
  VautoScoreResultSchema,
  ScoreComponentSchema,
  parseVautoScoreResult,
  type VautoScoreResult,
} from "./score-schema.js";
export {
  computeVautoScore,
  aggregateWeightedScore,
  collectReasonCodes,
  MIN_WEIGHT_COVERAGE,
} from "./score-engine.js";
export {
  explainVautoScore,
  explanationMathGuard,
  buildTemplateExplanation,
} from "./explanation.js";
export { scorePriceValue } from "./price-value.js";
export { scoreListingQuality } from "./listing-quality.js";
export { scoreSellerTrust } from "./seller-trust.js";
export { scoreDemand, normalizeDemandEvents } from "./demand.js";
export { scoreTransactionConfidence } from "./transaction-confidence.js";
