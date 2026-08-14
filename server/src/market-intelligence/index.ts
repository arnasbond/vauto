export { MARKET_INTELLIGENCE_VERSION } from "./types.js";
export type {
  AskingPriceVsMarket,
  MarketCategory,
  MarketObservation,
  MarketSubject,
  PriceSource,
  SellDraftPriceAdvice,
  ComparableLevel,
} from "./types.js";
export {
  ValuationResultSchema,
  parseValuationResult,
  type ValuationResult,
} from "./valuation-schema.js";
export {
  computeValuation,
  valueAutomotive,
  valueElectronics,
  valueGeneric,
  askingPriceVsMarket,
  adviseSellDraftPrice,
  type ValuationInput,
} from "./valuation-engine.js";
export { explainValuation, explanationGuard } from "./explanation.js";
export { pickComparableLevel, COMPARABLE_EXPANSION_LADDER } from "./comparable-selector.js";
export { MIN_SAMPLES_BY_LEVEL } from "./comparable-policy.js";
