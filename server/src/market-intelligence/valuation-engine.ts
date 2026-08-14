/**
 * Deterministic valuation engine — adapters for automotive / electronics / generic.
 * LLM NEVER computes prices.
 */

import { pickComparableLevel } from "./comparable-selector.js";
import {
  coefficientOfVariation,
  computeConfidence,
  confidenceBand,
  priceBasisOf,
} from "./confidence.js";
import { deduplicateObservations } from "./deduplication.js";
import { normalizeMarketSubject, normalizeObservation } from "./normalizer.js";
import { controlOutliers } from "./outlier-control.js";
import {
  attachTimeWeights,
  computeValuationRange,
  freshnessBounds,
} from "./statistics.js";
import {
  MARKET_INTELLIGENCE_VERSION,
  type AskingPriceVsMarket,
  type MarketObservation,
  type MarketSubject,
  type SellDraftPriceAdvice,
} from "./types.js";
import {
  insufficientResult,
  parseValuationResult,
  type ValuationResult,
} from "./valuation-schema.js";

export type ValuationInput = {
  subject: MarketSubject;
  observations: MarketObservation[];
  now?: Date;
  /** When false, APPROVED_EXTERNAL level is skipped (default true if any approved exist). */
  allowApprovedExternal?: boolean;
};

function filterPool(
  observations: MarketObservation[],
  allowExternal: boolean
): MarketObservation[] {
  const normalized: MarketObservation[] = [];
  for (const o of observations) {
    const n = normalizeObservation(o);
    if (!n) continue;
    if (n.priceSource === "VERIFIED_EXTERNAL" && !n.externalApproved) continue;
    if (!allowExternal && n.priceSource === "VERIFIED_EXTERNAL") continue;
    normalized.push(n);
  }
  return deduplicateObservations(normalized).unique;
}

function runCore(input: ValuationInput): ValuationResult {
  const subject = normalizeMarketSubject(input.subject);
  if (subject.category === "unsupported") {
    return parseValuationResult({
      status: "UNSUPPORTED",
      currency: "EUR",
      estimatedRange: null,
      comparableCount: 0,
      acceptedComparableCount: 0,
      excludedOutlierCount: 0,
      originalComparableCount: 0,
      comparableLevel: "INSUFFICIENT_DATA",
      confidence: 0,
      confidenceBand: "LOW",
      priceBasis: "ASKING_PRICE",
      dataFreshness: { newestAt: null, oldestAt: null },
      warnings: ["Kategorija nepalaikoma Market Intelligence 1.0."],
      methodologyVersion: MARKET_INTELLIGENCE_VERSION,
    });
  }

  const allowExternal = input.allowApprovedExternal !== false;
  const pool = filterPool(input.observations, allowExternal);
  const pick = pickComparableLevel(subject, pool);

  if (pick.level === "INSUFFICIENT_DATA" || pick.comps.length === 0) {
    return insufficientResult(
      [
        "Nepakanka palyginamų rinkos stebėjimų (Minimum Sample Policy).",
        "estimatedRange = N/A — kainos nesugalvojame.",
      ],
      {
        comparableCount: pick.comps.length,
        originalComparableCount: pick.comps.length,
        dataFreshness: freshnessBounds(pool),
      }
    );
  }

  const outlier = controlOutliers(
    pick.comps.map((c) => ({ id: c.id, price: c.price, observedAt: c.observedAt }))
  );

  if (outlier.acceptedComparableCount < 3) {
    return insufficientResult(
      [
        "Po ekstremumų kontrolės liko per mažai stebėjimų.",
        "estimatedRange = N/A.",
      ],
      {
        comparableCount: pick.comps.length,
        originalComparableCount: outlier.originalComparableCount,
        acceptedComparableCount: outlier.acceptedComparableCount,
        excludedOutlierCount: outlier.excludedOutlierCount,
        priceBasis: priceBasisOf(pick.comps.map((c) => c.priceSource)),
        dataFreshness: freshnessBounds(pick.comps),
      }
    );
  }

  const acceptedObs = pick.comps.filter((c) =>
    outlier.accepted.some((a) => a.id === c.id)
  );
  const weighted = attachTimeWeights(acceptedObs, input.now ?? new Date());
  const range = computeValuationRange(weighted);
  const sources = acceptedObs.map((c) => c.priceSource);
  const avgFresh =
    weighted.reduce((s, w) => s + w.weight, 0) / Math.max(1, weighted.length);
  const conf = computeConfidence({
    acceptedCount: outlier.acceptedComparableCount,
    originalCount: outlier.originalComparableCount,
    level: pick.level,
    levelFactor: pick.confidenceFactor,
    priceSources: sources,
    avgFreshnessWeight: avgFresh,
    priceDispersion: coefficientOfVariation(acceptedObs.map((c) => c.price)),
  });

  const warnings: string[] = [];
  if (pick.level !== "LOCAL_STRICT") {
    warnings.push(
      `Palyginimai išplėsti iki ${pick.level} — patikimumas sumažintas.`
    );
  }
  if (outlier.excludedOutlierCount > 0) {
    warnings.push(
      `Atmesta ekstremumų: ${outlier.excludedOutlierCount} (IQR kontrolė).`
    );
  }
  if (sources.includes("ASKING_PRICE") && !sources.includes("TRANSACTION_PRICE")) {
    warnings.push("Kainos pagrindas: ASKING_PRICE (ne sandorio kaina).");
  }

  return parseValuationResult({
    status: "AVAILABLE",
    currency: "EUR",
    estimatedRange: {
      low: range.low,
      median: range.median,
      high: range.high,
    },
    comparableCount: pick.comps.length,
    acceptedComparableCount: outlier.acceptedComparableCount,
    excludedOutlierCount: outlier.excludedOutlierCount,
    originalComparableCount: outlier.originalComparableCount,
    comparableLevel: pick.level,
    confidence: conf,
    confidenceBand: confidenceBand(conf),
    priceBasis: priceBasisOf(sources),
    dataFreshness: freshnessBounds(acceptedObs),
    warnings,
    methodologyVersion: MARKET_INTELLIGENCE_VERSION,
  });
}

/** Automotive adapter — vehicles category. */
export function valueAutomotive(input: ValuationInput): ValuationResult {
  return runCore({
    ...input,
    subject: { ...input.subject, category: "vehicles" },
  });
}

/** Electronics adapter. */
export function valueElectronics(input: ValuationInput): ValuationResult {
  return runCore({
    ...input,
    subject: { ...input.subject, category: "electronics" },
  });
}

/** Generic adapter for home/clothing/other. */
export function valueGeneric(input: ValuationInput): ValuationResult {
  return runCore(input);
}

/** Dispatch by subject category. */
export function computeValuation(input: ValuationInput): ValuationResult {
  if (input.subject.category === "vehicles") return valueAutomotive(input);
  if (input.subject.category === "electronics") return valueElectronics(input);
  return valueGeneric(input);
}

/** 10B signal — asking price vs market range. */
export function askingPriceVsMarket(
  askingPrice: number | null | undefined,
  valuation: ValuationResult
): AskingPriceVsMarket {
  if (
    askingPrice == null ||
    !Number.isFinite(askingPrice) ||
    valuation.status !== "AVAILABLE" ||
    !valuation.estimatedRange
  ) {
    return "UNKNOWN";
  }
  const { low, high } = valuation.estimatedRange;
  if (askingPrice < low) return "BELOW_RANGE";
  if (askingPrice > high) return "ABOVE_RANGE";
  return "WITHIN_RANGE";
}

/**
 * 10C SellDraft advisory — NEVER overwrites user price.
 */
export function adviseSellDraftPrice(
  userPrice: number,
  valuation: ValuationResult
): SellDraftPriceAdvice {
  const vs = askingPriceVsMarket(userPrice, valuation);
  const market = valuation.estimatedRange;
  let recommendation: string;
  if (!market || valuation.status !== "AVAILABLE") {
    recommendation =
      "Rinkos intervalo nėra (N/A). Palikite savo kainą — Market Intelligence neperrašo kainos.";
  } else if (vs === "ABOVE_RANGE") {
    recommendation = `Jūsų kaina ${Math.round(userPrice)} € viršija rinkos intervalą ~${market.low}–${market.high} € (vidurys ~${market.median} €). Rekomendacija informacinė — kaina nekeičiama.`;
  } else if (vs === "BELOW_RANGE") {
    recommendation = `Jūsų kaina ${Math.round(userPrice)} € žemiau rinkos intervalo ~${market.low}–${market.high} €. Galite palikti arba pakoreguoti patys.`;
  } else {
    recommendation = `Jūsų kaina ${Math.round(userPrice)} € patenka į rinkos intervalą ~${market.low}–${market.high} €.`;
  }
  return {
    userPrice,
    market,
    recommendation,
    overwriteUserPrice: false,
    askingPriceVsMarket: vs,
  };
}
