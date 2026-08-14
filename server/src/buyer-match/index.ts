export { BUYER_MATCH_VERSION } from "./version.js";
export {
  MATCH_WEIGHTS,
  EXPLANATION_TOP_N,
  REASON_CODE_ALLOWLIST,
  TRADEOFF_CODE_ALLOWLIST,
  REASON_CODE_SET,
  TRADEOFF_CODE_SET,
  isAllowedReasonCode,
  isAllowedTradeoffCode,
  type BuyerPreferences,
  type MatchListingRecord,
  type ReasonCode,
  type TradeoffCode,
} from "./types.js";
export {
  BuyerMatchRequestSchema,
  BuyerMatchResultSchema,
  BuyerMatchResponseSchema,
  BuyerPreferencesSchema,
  parseBuyerMatchRequest,
  parseBuyerMatchResponse,
  type BuyerMatchRequest,
  type BuyerMatchResult,
  type BuyerMatchResponse,
} from "./schema.js";
export { normalizePreferences, assertNoDiscriminatoryPreferenceKeys } from "./preference-normalizer.js";
export {
  evaluateHardConstraints,
  filterHardEligible,
  revalidateListing,
  criticalListingHash,
} from "./hard-constraint-filter.js";
export { extractMatchFeatures } from "./feature-extractor.js";
export { scoreMatchFeatures, compareMatchScores } from "./scorer.js";
export { rankEligibleMatches } from "./ranking.js";
export { runBuyerMatch, type RunBuyerMatchInput } from "./match-engine.js";
export {
  explainBuyerMatch,
  explanationMatchGuard,
  buildMatchSummary,
} from "./explanation.js";
