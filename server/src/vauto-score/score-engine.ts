/**
 * Deterministic VAUTO Score engine — weighted aggregation.
 * LLM never computes scores.
 *
 * Monotonicity: adding a positive verified signal to a component must not
 * decrease that component's score when other inputs are held fixed (tested).
 */

import { scoreDemand } from "./demand.js";
import { buildTemplateExplanation } from "./explanation.js";
import { scoreListingQuality } from "./listing-quality.js";
import { scorePriceValue } from "./price-value.js";
import { scoreSellerTrust } from "./seller-trust.js";
import {
  parseVautoScoreResult,
  type VautoScoreResult,
} from "./score-schema.js";
import { scoreTransactionConfidence } from "./transaction-confidence.js";
import type { ReasonCode, ScoreComponent, VautoScoreInput } from "./types.js";
import { SCORE_WEIGHTS } from "./types.js";
import { VAUTO_SCORE_VERSION } from "./version.js";

/** Minimum weight coverage of non-null components to emit a total. */
export const MIN_WEIGHT_COVERAGE = 0.35;

function roundScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

export function aggregateWeightedScore(
  components: VautoScoreResult["components"]
): {
  totalScore: number | null;
  coverage: number;
  confidence: number;
  presentKeys: (keyof typeof SCORE_WEIGHTS)[];
} {
  let wSum = 0;
  let weighted = 0;
  let confAcc = 0;
  let confW = 0;
  const presentKeys: (keyof typeof SCORE_WEIGHTS)[] = [];

  for (const key of Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]) {
    const c = components[key];
    if (c.score == null) continue;
    presentKeys.push(key);
    wSum += c.weight;
    weighted += c.score * c.weight;
    confAcc += c.confidence * c.weight;
    confW += c.weight;
  }

  const totalWeight = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  const coverage = wSum / totalWeight;

  if (coverage < MIN_WEIGHT_COVERAGE || presentKeys.length === 0) {
    return {
      totalScore: null,
      coverage,
      confidence: confW > 0 ? confAcc / confW : 0,
      presentKeys,
    };
  }

  // Renormalize over available components only (missing = N/A, not 50)
  const totalScore = roundScore(weighted / wSum);
  const confidence = Math.min(
    1,
    Math.max(0, Math.round((confW > 0 ? confAcc / confW : 0) * coverage * 1000) / 1000)
  );

  return { totalScore, coverage, confidence, presentKeys };
}

export function computeVautoScore(input: VautoScoreInput): VautoScoreResult {
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const missingSignals: string[] = [];
  const warnings: string[] = [];
  const aggregateReasons: ReasonCode[] = [];

  const price = scorePriceValue(input);
  const listing = scoreListingQuality(input.listing);
  const seller = scoreSellerTrust(input.seller);
  const demand = scoreDemand(input.demand);
  const transaction = scoreTransactionConfidence(input.transaction);

  missingSignals.push(
    ...price.missing,
    ...listing.missing,
    ...seller.missing,
    ...demand.missing,
    ...transaction.missing
  );

  const components = {
    priceValue: price.component,
    listingQuality: listing.component,
    sellerTrust: seller.component,
    demand: demand.component,
    transactionConfidence: transaction.component,
  };

  // Invariant: never emit fake mid-default
  for (const [k, c] of Object.entries(components)) {
    if (c.score === 50 && c.confidence === 0 && c.reasonCodes.length === 0) {
      warnings.push(`suspicious_mid_default:${k}`);
    }
  }

  const agg = aggregateWeightedScore(components);

  let status: VautoScoreResult["status"];
  if (agg.totalScore == null) {
    status = "INSUFFICIENT_DATA";
    aggregateReasons.push("SCORE_INSUFFICIENT_COVERAGE");
  } else if (agg.coverage < 0.999) {
    status = "PARTIAL";
    aggregateReasons.push("SCORE_PARTIAL_COVERAGE");
  } else {
    status = "AVAILABLE";
    aggregateReasons.push("SCORE_FULL_COVERAGE");
  }

  if (seller.component.reasonCodes.includes("NEW_SELLER_NO_HISTORY")) {
    warnings.push(
      "Naujas pardavėjas be istorijos — sellerTrust N/A arba nebaudžiamas kaip nepatikimas."
    );
  }

  const summaryExplanation = buildTemplateExplanation({
    status,
    totalScore: agg.totalScore,
    components,
    reasonCodes: collectReasonCodes(components, aggregateReasons),
  });

  return parseVautoScoreResult({
    status,
    totalScore: agg.totalScore,
    scoreVersion: VAUTO_SCORE_VERSION,
    components,
    confidence: agg.confidence,
    missingSignals: [...new Set(missingSignals)],
    warnings: [...new Set(warnings)].slice(0, 32),
    summaryExplanation,
    calculatedAt,
  });
}

export function collectReasonCodes(
  components: VautoScoreResult["components"],
  extra: ReasonCode[] = []
): ReasonCode[] {
  const out: ReasonCode[] = [...extra];
  for (const c of Object.values(components) as ScoreComponent[]) {
    for (const r of c.reasonCodes) out.push(r);
  }
  return [...new Set(out)];
}

export { SCORE_WEIGHTS, MIN_WEIGHT_COVERAGE as minWeightCoverage };
