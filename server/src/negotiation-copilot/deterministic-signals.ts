/**
 * Deterministic negotiation signals — numbers NEVER invented by LLM.
 */

import type {
  CopilotContext,
  DeterministicBounds,
  NegotiationSignal,
  RecommendationType,
} from "./types.js";

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildDeterministicSignals(
  ctx: CopilotContext
): { signals: NegotiationSignal[]; bounds: DeterministicBounds } {
  const signals: NegotiationSignal[] = [];
  const asking = ctx.askingCents;
  const offer = ctx.activeOfferCents;

  let deltaPercentVsAsking: number | null = null;
  if (asking != null && asking > 0 && offer != null) {
    deltaPercentVsAsking = roundPct(((offer - asking) / asking) * 100);
    const abs = Math.abs(deltaPercentVsAsking);
    if (abs <= 2) {
      signals.push({
        code: "OFFER_NEAR_ASKING",
        value: deltaPercentVsAsking,
        detail: `Pasiūlymas ~${deltaPercentVsAsking}% nuo prašomos kainos`,
      });
    } else if (deltaPercentVsAsking < 0) {
      signals.push({
        code: "OFFER_BELOW_ASKING_BY_PERCENT",
        value: deltaPercentVsAsking,
        detail: `Pasiūlymas ${Math.abs(deltaPercentVsAsking)}% žemiau prašomos`,
      });
    } else {
      signals.push({
        code: "OFFER_ABOVE_ASKING_BY_PERCENT",
        value: deltaPercentVsAsking,
        detail: `Pasiūlymas ${deltaPercentVsAsking}% aukščiau prašomos`,
      });
    }
  } else if (offer == null) {
    signals.push({
      code: "NO_ACTIVE_OFFER",
      value: null,
      detail: "Nėra aktyvaus PENDING pasiūlymo",
    });
  }

  const mLow = ctx.marketLowCents;
  const mHigh = ctx.marketHighCents;
  const mMed = ctx.marketMedianCents;
  if (mLow == null || mHigh == null || mMed == null) {
    signals.push({
      code: "MARKET_DATA_MISSING",
      value: null,
      detail: "Rinkos rėžių nėra — rekomendacija atsargi",
    });
  } else if (offer != null) {
    if (offer >= mLow && offer <= mHigh) {
      signals.push({
        code: "OFFER_WITHIN_MARKET_RANGE",
        value: offer,
        detail: "Pasiūlymas rinkos rėžyje",
      });
    } else if (offer < mLow) {
      signals.push({
        code: "OFFER_BELOW_MARKET_RANGE",
        value: offer,
        detail: "Pasiūlymas žemiau rinkos apačios",
      });
    } else {
      signals.push({
        code: "OFFER_ABOVE_MARKET_RANGE",
        value: offer,
        detail: "Pasiūlymas aukščiau rinkos viršaus",
      });
    }
    // Thin comps heuristic: if only one bound side known we already have all three
  }

  if (ctx.injectionDetectedInChat) {
    signals.push({
      code: "INJECTION_DETECTED_IN_CHAT",
      value: null,
      detail: "Pokalbyje aptiktas galimas injection — tekstas neutralizuotas",
    });
  }

  if (ctx.vautoScore != null) {
    signals.push({
      code: "SCORE_AVAILABLE",
      value: ctx.vautoScore,
      detail: `VAUTO Score: ${ctx.vautoScore}`,
    });
  } else {
    signals.push({
      code: "SCORE_UNAVAILABLE",
      value: null,
      detail: "VAUTO Score neprieinamas",
    });
  }

  // Counter bounds: deterministic mid-band between offer and asking (or market)
  let suggestedCounterMinCents: number | null = null;
  let suggestedCounterMaxCents: number | null = null;
  if (offer != null && asking != null && asking > 0) {
    const lo = Math.min(offer, asking);
    const hi = Math.max(offer, asking);
    const span = hi - lo;
    suggestedCounterMinCents = Math.max(1, lo + Math.floor(span * 0.25));
    suggestedCounterMaxCents = Math.max(
      suggestedCounterMinCents,
      lo + Math.floor(span * 0.75)
    );
    if (mLow != null && mHigh != null) {
      suggestedCounterMinCents = Math.max(suggestedCounterMinCents, mLow);
      suggestedCounterMaxCents = Math.min(suggestedCounterMaxCents, mHigh);
      if (suggestedCounterMinCents > suggestedCounterMaxCents) {
        suggestedCounterMinCents = mLow;
        suggestedCounterMaxCents = mHigh;
      }
    }
  }

  const bounds: DeterministicBounds = {
    suggestedCounterMinCents,
    suggestedCounterMaxCents,
    askingCents: asking,
    activeOfferCents: offer,
    marketLowCents: mLow,
    marketMedianCents: mMed,
    marketHighCents: mHigh,
    deltaPercentVsAsking,
  };

  return { signals, bounds };
}

export function pickRecommendationType(
  ctx: CopilotContext,
  signals: NegotiationSignal[]
): RecommendationType {
  if (ctx.injectionDetectedInChat) {
    // Still allow analysis of numbers, but prefer HOLD / ASK
    // Injection does not force NO_RECOMMENDATION alone
  }

  const codes = new Set(signals.map((s) => s.code));
  if (codes.has("NO_ACTIVE_OFFER")) {
    if (codes.has("MARKET_DATA_MISSING")) return "ASK_FOR_MORE_INFO";
    return "ASK_FOR_MORE_INFO";
  }

  if (codes.has("MARKET_DATA_MISSING") && codes.has("OFFER_NEAR_ASKING")) {
    return "ACCEPT_MAY_BE_REASONABLE";
  }
  if (codes.has("OFFER_WITHIN_MARKET_RANGE") && codes.has("OFFER_NEAR_ASKING")) {
    return "ACCEPT_MAY_BE_REASONABLE";
  }
  if (codes.has("OFFER_BELOW_MARKET_RANGE")) {
    return ctx.actorRole === "SELLER"
      ? "COUNTER_MAY_BE_REASONABLE"
      : "HOLD";
  }
  if (codes.has("OFFER_ABOVE_MARKET_RANGE")) {
    return ctx.actorRole === "BUYER"
      ? "COUNTER_MAY_BE_REASONABLE"
      : "ACCEPT_MAY_BE_REASONABLE";
  }
  if (codes.has("OFFER_BELOW_ASKING_BY_PERCENT")) {
    const sig = signals.find((s) => s.code === "OFFER_BELOW_ASKING_BY_PERCENT");
    const pct = Math.abs(sig?.value ?? 0);
    if (pct >= 15) {
      return ctx.actorRole === "SELLER"
        ? "REJECT_MAY_BE_REASONABLE"
        : "HOLD";
    }
    if (pct >= 5) return "COUNTER_MAY_BE_REASONABLE";
    return "HOLD";
  }
  if (codes.has("OFFER_NEAR_ASKING")) return "ACCEPT_MAY_BE_REASONABLE";

  return "HOLD";
}
