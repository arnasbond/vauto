/**
 * VAUTO Natural Language Search Engine (Etapas 10B).
 *
 * Prompt → 10A Intent → SearchQuery → hard validation → catalog (real IDs) → rank
 * → optional async AI explanation (candidate-set guard).
 *
 * LLM NEVER generates / invents listings.
 */

import { AI_FOUNDATION_VERSION, recordAiTelemetry } from "../foundation/index.js";
import { classifyIntent, type IntentFastLlmCaller } from "../intent/index.js";
import {
  assertHardConstraintsPreserved,
  filterListingsByQuery,
} from "./catalog-filter.js";
import {
  scheduleAiExplanation,
  validateAiExplanationAgainstCandidates,
} from "./explanation-guard.js";
import {
  hardConstraintsOf,
  intentToSearchQuery,
  isSearchableIntent,
} from "./intent-to-search-query.js";
import { rankListings } from "./ranking.js";
import {
  parseSearchQuery,
  type AskingPriceVsMarketSignal,
  type NlSearchResult,
  type SearchListingRecord,
  type SearchQuery,
} from "./search-schema.js";
import { suggestRelaxations } from "./zero-result.js";

export type NlSearchCatalogPort = {
  /** Return listings from VAUTO DB / trusted catalog — never LLM-fabricated. */
  loadCandidates: (query: SearchQuery) => Promise<SearchListingRecord[]> | SearchListingRecord[];
};

export type NlSearchInput = {
  text: string;
  requestId?: string;
  catalog: NlSearchCatalogPort;
  llmCaller?: IntentFastLlmCaller | null;
  limit?: number;
  /**
   * Optional progressive explanation producer (async; does not block results).
   * Output is rejected if it mentions non-candidate listing IDs.
   */
  explainProducer?: (() => Promise<string>) | null;
  /**
   * Optional 10D signal: compare a reference asking price to a precomputed
   * Market Intelligence ValuationResult (deterministic only).
   */
  marketSignal?: {
    askingPrice: number | null | undefined;
    resolve: (askingPrice: number | null | undefined) => AskingPriceVsMarketSignal;
  };
};

export type NlSearchOutput = NlSearchResult & {
  explanationPromise?: Promise<string | null>;
};

export async function runNaturalLanguageSearch(
  input: NlSearchInput
): Promise<NlSearchOutput> {
  const started = Date.now();
  const originalText = String(input.text ?? "").slice(0, 4000);

  const intent = await classifyIntent({
    text: originalText,
    requestId: input.requestId,
    llmCaller: input.llmCaller ?? null,
  });

  if (!isSearchableIntent(intent.intent) || intent.abstained) {
    const blocked: NlSearchOutput = {
      originalText,
      normalizedText: intent.normalizedText,
      intent: intent.intent,
      query: null,
      results: [],
      candidateIds: [],
      zeroResult: true,
      suggestedRelaxations: [],
      blockedReason: intent.abstained
        ? "intent_abstained"
        : `intent_not_searchable:${intent.intent}`,
      hardConstraints: {},
      foundationVersion: AI_FOUNDATION_VERSION,
      latencyMs: Date.now() - started,
    };
    recordAiTelemetry({
      requestId: input.requestId,
      taskType: "nl_search.blocked",
      taskClass: "FAST",
      provider: "nl-search",
      model: "rules+catalog",
      latencyMs: blocked.latencyMs,
      success: true,
      abstained: true,
      errorCode: blocked.blockedReason ?? null,
    });
    return blocked;
  }

  let query: SearchQuery;
  try {
    query = intentToSearchQuery(intent);
    query = parseSearchQuery(query);
  } catch {
    const failed: NlSearchOutput = {
      originalText,
      normalizedText: intent.normalizedText,
      intent: intent.intent,
      query: null,
      results: [],
      candidateIds: [],
      zeroResult: true,
      suggestedRelaxations: [],
      blockedReason: "search_query_invalid",
      hardConstraints: {},
      foundationVersion: AI_FOUNDATION_VERSION,
      latencyMs: Date.now() - started,
    };
    return failed;
  }

  const hardConstraints = hardConstraintsOf(query);
  const loaded = await input.catalog.loadCandidates(query);
  const filtered = filterListingsByQuery(loaded, query);

  if (!assertHardConstraintsPreserved(filtered, query)) {
    // Safety: drop any that somehow violate (should be empty set)
    const safe = filterListingsByQuery(filtered, query);
    filtered.length = 0;
    filtered.push(...safe);
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const ranked = rankListings(filtered, query).slice(0, limit);
  const candidateIds = ranked.map((h) => h.id);
  const zeroResult = ranked.length === 0;

  const result: NlSearchOutput = {
    originalText,
    normalizedText: intent.normalizedText,
    intent: intent.intent,
    query,
    results: ranked,
    candidateIds,
    zeroResult,
    suggestedRelaxations: zeroResult ? suggestRelaxations(query) : [],
    hardConstraints,
    foundationVersion: AI_FOUNDATION_VERSION,
    latencyMs: Date.now() - started,
    askingPriceVsMarket: input.marketSignal
      ? input.marketSignal.resolve(input.marketSignal.askingPrice)
      : "UNKNOWN",
  };

  if (input.explainProducer) {
    const { explanationPromise } = scheduleAiExplanation({
      candidateIds,
      produce: input.explainProducer,
    });
    result.explanationPromise = explanationPromise;
  }

  recordAiTelemetry({
    requestId: input.requestId,
    taskType: "nl_search.run",
    taskClass: "FAST",
    provider: "nl-search",
    model: "rules+catalog",
    latencyMs: result.latencyMs,
    success: true,
    abstained: false,
    errorCode: zeroResult ? "zero_result" : null,
  });

  return result;
}

export {
  validateAiExplanationAgainstCandidates,
  scheduleAiExplanation,
} from "./explanation-guard.js";

/** Explicit auditor flag: this module never fabricates listing rows. */
export const NL_SEARCH_LLM_GENERATES_LISTINGS = false as const;
