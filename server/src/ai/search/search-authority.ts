/**
 * R4.1 — interpreted search-state authority (category / price / location).
 *
 * The model interprets natural language; this deterministic layer VALIDATES and
 * NORMALIZES the interpreted structured state before it reaches SQL. It never
 * replaces the model's interpretation with a parser, and it never turns an
 * invalid/hallucinated model value into a result-narrowing filter.
 */

import { tryResolveListingCategoryId } from "../../shared/category-registry.js";

/**
 * Resolve the search category. A valid model category (canonical id or known
 * alias) is kept; an unknown/hallucinated model category is OMITTED (never
 * coerced to "other") and the user-derived category is used instead; the prior
 * persisted category is the lowest-priority fallback (R4.3B search continuity).
 * Returns `undefined` when there is no supported category.
 */
export function resolveSearchCategory(
  modelCategory: string | undefined,
  userCategory: string | undefined,
  priorCategory?: string | undefined
): string | undefined {
  const model = modelCategory
    ? tryResolveListingCategoryId(String(modelCategory))
    : null;
  // The category deterministically extracted from the current user turn is
  // authoritative. A valid model category may fill a gap, but must never
  // replace a category the user actually named.
  return userCategory ?? model ?? priorCategory ?? undefined;
}

export interface SearchPriceResult {
  minPrice?: number;
  maxPrice?: number;
  /** True when two explicit bounds genuinely contradict and were NOT rewritten. */
  conflict: boolean;
}

/**
 * Validate price bounds with PROVENANCE. NaN / negative values are dropped.
 *
 * - Mixed provenance (one bound explicit-user, the other model/stale) with
 *   min > max: the model/stale bound is DROPPED and the explicit user bound is
 *   kept — never swapped into an invented range that overrides the user.
 * - Same provenance (both user or both model) with min > max: cannot be proven
 *   to be a mere reversal, so fail safe — both bounds are omitted (broader,
 *   never an invented valid range), and `conflict` is surfaced.
 */
export function resolveSearchPrice(input: {
  modelMin?: unknown;
  modelMax?: unknown;
  userMin?: number;
  userMax?: number;
  /** R4.3B — prior persisted search state (lowest authority fallback). */
  priorMin?: number;
  priorMax?: number;
}): SearchPriceResult {
  const modelMinNum =
    input.modelMin != null ? Number(input.modelMin) : undefined;
  const modelMaxNum =
    input.modelMax != null ? Number(input.modelMax) : undefined;

  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  let minFromUser = false;
  let maxFromUser = false;

  if (
    input.userMin != null &&
    Number.isFinite(input.userMin) &&
    input.userMin >= 0
  ) {
    minPrice = input.userMin;
    minFromUser = true;
  } else if (
    modelMinNum != null &&
    Number.isFinite(modelMinNum) &&
    modelMinNum >= 0
  ) {
    minPrice = modelMinNum;
  } else if (
    input.priorMin != null &&
    Number.isFinite(input.priorMin) &&
    input.priorMin >= 0
  ) {
    // R4.3B — carry the prior persisted bound forward (continuity).
    minPrice = input.priorMin;
  }

  if (
    input.userMax != null &&
    Number.isFinite(input.userMax) &&
    input.userMax >= 0
  ) {
    maxPrice = input.userMax;
    maxFromUser = true;
  } else if (
    modelMaxNum != null &&
    Number.isFinite(modelMaxNum) &&
    modelMaxNum >= 0
  ) {
    maxPrice = modelMaxNum;
  } else if (
    input.priorMax != null &&
    Number.isFinite(input.priorMax) &&
    input.priorMax >= 0
  ) {
    // R4.3B — carry the prior persisted bound forward (continuity).
    maxPrice = input.priorMax;
  }

  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    if (minFromUser !== maxFromUser) {
      // Mixed provenance: the explicit user bound wins, the model/stale bound
      // is dropped. Never transform into an invented [userMax, modelMin] range.
      if (maxFromUser) {
        minPrice = undefined;
      } else {
        maxPrice = undefined;
      }
      return { minPrice, maxPrice, conflict: false };
    }
    // Same source, contradicting: cannot prove a safe reversal → fail safe.
    return { minPrice: undefined, maxPrice: undefined, conflict: true };
  }

  return { minPrice, maxPrice, conflict: false };
}

/**
 * Resolve the search city string. An explicit current-user location outranks a
 * model-only (stale/hallucinated) city; the model may supply a city only when
 * the user stated none; the prior persisted city is the lowest-priority
 * fallback (R4.3B search continuity).
 */
export function resolveSearchCity(
  modelCity: string | undefined,
  userCity: string | undefined,
  priorCity?: string | undefined
): string {
  const explicit = (userCity ?? "").trim();
  if (explicit) return explicit;
  const model = modelCity ? String(modelCity).trim() : "";
  if (model) return model;
  return priorCity ? String(priorCity).trim() : "";
}
