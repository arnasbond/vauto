/**
 * Price-value component — ONLY from 10D Market Intelligence signals.
 * Never invents a market range inside the score engine.
 */

import { askingPriceVsMarket as miAskingVsMarket } from "../market-intelligence/valuation-engine.js";
import type { ScoreComponent, VautoScoreInput } from "./types.js";
import { SCORE_WEIGHTS } from "./types.js";
import type { ReasonCode } from "./types.js";

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function scorePriceValue(input: VautoScoreInput): {
  component: ScoreComponent;
  missing: string[];
} {
  const weight = SCORE_WEIGHTS.priceValue;
  const missing: string[] = [];
  const reasons: ReasonCode[] = [];

  const asking = input.askingPrice;
  if (asking == null || !Number.isFinite(asking) || asking <= 0) {
    missing.push("askingPrice");
    reasons.push("PRICE_ASKING_MISSING");
    return {
      component: {
        score: null,
        weight,
        confidence: 0,
        reasonCodes: reasons,
      },
      missing,
    };
  }

  let vs = input.askingPriceVsMarket ?? null;
  if (!vs && input.marketValuation) {
    vs = miAskingVsMarket(asking, input.marketValuation);
  }

  if (!vs || vs === "UNKNOWN" || !input.marketValuation || input.marketValuation.status !== "AVAILABLE") {
    missing.push("marketValuation");
    reasons.push("PRICE_MARKET_UNAVAILABLE");
    return {
      component: {
        score: null,
        weight,
        confidence: 0,
        reasonCodes: reasons,
      },
      missing,
    };
  }

  const miConf = input.marketValuation.confidence;
  let score: number;
  if (vs === "WITHIN_RANGE") {
    score = 85;
    reasons.push("PRICE_WITHIN_MARKET_RANGE");
  } else if (vs === "BELOW_RANGE") {
    // Attractive to buyers — higher value score
    score = 95;
    reasons.push("PRICE_BELOW_MARKET_RANGE");
  } else {
    // ABOVE_RANGE — still informative, lower attractiveness
    const range = input.marketValuation.estimatedRange!;
    const overshoot = (asking - range.high) / Math.max(range.high, 1);
    score = clampScore(55 - Math.min(40, overshoot * 80));
    reasons.push("PRICE_ABOVE_MARKET_RANGE");
  }

  return {
    component: {
      score,
      weight,
      confidence: Math.min(1, Math.max(0, miConf)),
      reasonCodes: reasons,
    },
    missing,
  };
}
