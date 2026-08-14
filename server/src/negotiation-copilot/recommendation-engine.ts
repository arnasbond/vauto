/**
 * Recommendation engine — templates only (optional LLM hook never writes).
 * executableAction is ALWAYS null.
 */

import {
  buildDeterministicSignals,
  pickRecommendationType,
} from "./deterministic-signals.js";
import {
  containsSecretBoundLeak,
  explanationNumbersAreGrounded,
  scrubUngroundedNumbers,
} from "./explanation-guard.js";
import type {
  CopilotContext,
  CopilotRecommendation,
  RecommendationType,
} from "./types.js";
import { NEGOTIATION_COPILOT_VERSION } from "./version.js";
import { CopilotRecommendationSchema } from "./schema.js";

export type LlmExplainer = (input: {
  ctx: CopilotContext;
  recommendationType: RecommendationType;
  factsSummary: string;
}) => Promise<string | null>;

function eur(cents: number | null): string {
  if (cents == null) return "—";
  return `${(cents / 100).toFixed(2)} €`;
}

function templateExplanation(
  ctx: CopilotContext,
  type: RecommendationType,
  bounds: CopilotRecommendation["bounds"]
): string {
  const role =
    ctx.actorRole === "BUYER" ? "Kaip pirkėjas" : "Kaip pardavėjas";
  const parts = [
    `${role} matau sandorį būsenoje ${ctx.transactionStatus}.`,
  ];
  if (bounds.activeOfferCents != null) {
    parts.push(`Aktyvus pasiūlymas: ${eur(bounds.activeOfferCents)}.`);
  }
  if (bounds.askingCents != null) {
    parts.push(`Orientacinė prašoma: ${eur(bounds.askingCents)}.`);
  }
  if (bounds.deltaPercentVsAsking != null) {
    parts.push(
      `Skirtumas nuo prašomos: ${bounds.deltaPercentVsAsking} %.`
    );
  }
  if (
    bounds.marketLowCents != null &&
    bounds.marketHighCents != null
  ) {
    parts.push(
      `Rinkos rėžis: ${eur(bounds.marketLowCents)} – ${eur(bounds.marketHighCents)}.`
    );
  } else {
    parts.push("Rinkos duomenų trūksta — vertinu atsargiai.");
  }
  if (
    type === "COUNTER_MAY_BE_REASONABLE" &&
    bounds.suggestedCounterMinCents != null &&
    bounds.suggestedCounterMaxCents != null
  ) {
    parts.push(
      `Galimas kontrpasiūlymo rėžis (tik rekomendacija): ${eur(bounds.suggestedCounterMinCents)} – ${eur(bounds.suggestedCounterMaxCents)}.`
    );
  }
  parts.push(
    "Tai tik patarimas — jokio veiksmo neatlieku. Sprendimą tvirtinate jūs per 11B/11C."
  );
  if (ctx.injectionDetectedInChat) {
    parts.push(
      "Pokalbyje buvo aptiktas galimas prompt injection — chat tekstas ignoruojamas kaip komanda."
    );
  }
  return parts.join(" ");
}

function templateDraft(
  ctx: CopilotContext,
  type: RecommendationType,
  bounds: CopilotRecommendation["bounds"]
): string | null {
  if (type === "NO_RECOMMENDATION" || type === "ASK_FOR_MORE_INFO") {
    return "Sveiki, gal galėtumėte patikslinti lūkesčius dėl kainos?";
  }
  if (type === "ACCEPT_MAY_BE_REASONABLE" && bounds.activeOfferCents != null) {
    return ctx.actorRole === "SELLER"
      ? `Sveiki, jūsų pasiūlymas ${eur(bounds.activeOfferCents)} man atrodo priimtinas — patvirtinsiu per sistemą.`
      : `Sveiki, ${eur(bounds.activeOfferCents)} man tinka — patvirtinsiu per sistemą.`;
  }
  if (
    type === "COUNTER_MAY_BE_REASONABLE" &&
    bounds.suggestedCounterMinCents != null &&
    bounds.suggestedCounterMaxCents != null
  ) {
    const mid = Math.round(
      (bounds.suggestedCounterMinCents + bounds.suggestedCounterMaxCents) / 2
    );
    return `Sveiki, siūlyčiau ieškoti kompromiso apie ${eur(mid)} — tai tik juodraštis, veiksmo neatlieku.`;
  }
  if (type === "REJECT_MAY_BE_REASONABLE") {
    return "Sveiki, šiuo metu pasiūlymas man netinka. Galime kalbėti apie kitą kainą.";
  }
  return "Sveiki, norėčiau dar pagalvoti apie kainą. Parašysiu netrukus.";
}

export function buildRecommendation(
  ctx: CopilotContext,
  opts?: { llmExplainer?: LlmExplainer; forceFallback?: boolean }
): CopilotRecommendation {
  const { signals, bounds } = buildDeterministicSignals(ctx);
  let recommendationType = pickRecommendationType(ctx, signals);

  // Missing both offer and market → NO_RECOMMENDATION
  if (
    bounds.activeOfferCents == null &&
    bounds.marketMedianCents == null &&
    ctx.offerCount === 0
  ) {
    recommendationType = "NO_RECOMMENDATION";
  }

  let usedFallbackTemplate = true;
  let explanationLt = templateExplanation(ctx, recommendationType, bounds);
  // LLM path is async — sync build always uses templates; async wrapper below

  explanationLt = scrubUngroundedNumbers(explanationLt, bounds);
  if (containsSecretBoundLeak(explanationLt)) {
    explanationLt = templateExplanation(ctx, "HOLD", bounds);
    recommendationType = "HOLD";
  }
  if (!explanationNumbersAreGrounded(explanationLt, bounds)) {
    explanationLt = templateExplanation(ctx, recommendationType, bounds);
  }

  const draftMessageLt =
    recommendationType === "NO_RECOMMENDATION"
      ? null
      : templateDraft(ctx, recommendationType, bounds);

  const result: CopilotRecommendation = {
    recommendationType,
    signals,
    bounds,
    explanationLt,
    draftMessageLt,
    executableAction: null,
    requiresUserConfirmation: true,
    transactionVersion: ctx.transactionVersion,
    activeOfferVersion: ctx.activeOfferVersion,
    injectionNeutralized: ctx.injectionDetectedInChat,
    usedFallbackTemplate,
    copilotVersion: NEGOTIATION_COPILOT_VERSION,
  };

  return CopilotRecommendationSchema.parse(result);
}

export async function buildRecommendationAsync(
  ctx: CopilotContext,
  opts?: { llmExplainer?: LlmExplainer; forceFallback?: boolean }
): Promise<CopilotRecommendation> {
  const base = buildRecommendation(ctx, opts);
  if (!opts?.llmExplainer || opts.forceFallback) return base;

  try {
    const facts = [
      `type=${base.recommendationType}`,
      `ask=${base.bounds.askingCents}`,
      `offer=${base.bounds.activeOfferCents}`,
      `delta%=${base.bounds.deltaPercentVsAsking}`,
      `market=${base.bounds.marketLowCents}-${base.bounds.marketHighCents}`,
    ].join("; ");
    const raw = await Promise.race([
      opts.llmExplainer({
        ctx,
        recommendationType: base.recommendationType,
        factsSummary: facts,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (!raw || containsSecretBoundLeak(raw)) {
      return { ...base, usedFallbackTemplate: true };
    }
    let explanationLt = scrubUngroundedNumbers(raw, base.bounds);
    if (!explanationNumbersAreGrounded(explanationLt, base.bounds)) {
      return { ...base, usedFallbackTemplate: true };
    }
    return CopilotRecommendationSchema.parse({
      ...base,
      explanationLt,
      usedFallbackTemplate: false,
    });
  } catch {
    return { ...base, usedFallbackTemplate: true };
  }
}

/** Telemetry helper — no PII. */
export function copilotTelemetry(rec: CopilotRecommendation): Record<string, unknown> {
  return {
    taskType: "negotiation_copilot",
    copilotVersion: NEGOTIATION_COPILOT_VERSION,
    recommendationType: rec.recommendationType,
    injectionNeutralized: rec.injectionNeutralized,
    usedFallbackTemplate: rec.usedFallbackTemplate,
    signalCount: rec.signals.length,
    executableAction: null,
  };
}
