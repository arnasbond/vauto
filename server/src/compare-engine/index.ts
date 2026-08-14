export { COMPARE_ENGINE_VERSION } from "./version.js";
export {
  COMPARE_MIN_LISTINGS,
  COMPARE_MAX_LISTINGS,
  DELTA_KEYS,
  COMPARE_TRADEOFF_ALLOWLIST,
  COMPARE_TRADEOFF_SET,
  isAllowedCompareTradeoff,
  type CompareListingRecord,
  type CompareTradeoffCode,
  type DeltaKey,
  type CompareCategory,
} from "./types.js";
export {
  CompareRequestSchema,
  CompareResponseSchema,
  ComparisonListingSnapshotSchema,
  parseCompareRequest,
  parseCompareResponse,
  type CompareRequest,
  type CompareResponse,
  type ComparisonListingSnapshot,
} from "./schema.js";
export {
  runCompareEngine,
  compareListingsSync,
  type CompareCatalogPort,
  type RunCompareInput,
} from "./compare-engine.js";
export {
  computeDeltas,
  collectDeterministicNumbers,
} from "./delta-engine.js";
export { computeTradeoffs, buildKeyTakeaways } from "./tradeoff-engine.js";
export {
  explainCompare,
  explanationCompareGuard,
  buildTemplateSummary,
} from "./explanation.js";
export {
  criticalCompareHash,
  isStaleSnapshot,
  isAuthorizedListing,
  toComparisonSnapshot,
  resolveCompareCategory,
} from "./listing-normalizer.js";
export {
  AUTOMOTIVE_ATTR_KEYS,
  ELECTRONICS_ATTR_KEYS,
  GENERIC_ATTR_KEYS,
} from "./category-adapters/index.js";
