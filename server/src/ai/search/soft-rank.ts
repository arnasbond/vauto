/**
 * R4.2 — general soft-preference ranking layer.
 *
 * Preferences affect ORDER/relevance, NEVER eligibility. Hard eligibility is
 * already applied by the SQL layer (repository.searchListingsFiltered); this
 * module only re-orders the eligible set so a preferred match ranks above an
 * otherwise-comparable non-match. It is intentionally a SMALL shared layer —
 * not the buyer-match subsystem (which is coupled to its own 10B record shape)
 * and not a second phrase-based intent engine.
 */

import type { SearchPreference } from "../agent-memory-context.js";

export interface SoftRankableListing {
  id: string;
  title?: string;
  category?: string;
  location?: string;
  price?: number;
  description?: string;
  attributes?: Record<string, string | string[] | undefined>;
}

function attrText(
  attrs: Record<string, string | string[] | undefined> | undefined,
  ...keys: string[]
): string {
  if (!attrs) return "";
  for (const key of keys) {
    const v = attrs[key];
    if (v === undefined || v === null) continue;
    return Array.isArray(v) ? v.map(String).join(" ") : String(v);
  }
  return "";
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matches(haystack: string, value: string): boolean {
  const h = fold(haystack);
  const v = fold(value).trim();
  if (!v) return false;
  const tokens = v.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return h.includes(v);
  return tokens.every((t) => h.includes(t));
}

/**
 * Score a listing against soft preferences. Returns a non-negative boost
 * (0 = no preference match). Exclusions apply a strong NEGATIVE boost (deprioritize,
 * never exclude). All scores are additive and bounded — no eligibility effect.
 */
export function softPreferenceBoost(
  listing: SoftRankableListing,
  prefs: SearchPreference | undefined
): number {
  if (!prefs) return 0;
  const attrs = listing.attributes ?? {};
  const hay = [
    listing.title,
    listing.category,
    listing.location,
    listing.description,
    attrText(attrs, "bodyType", "body"),
    attrText(attrs, "fuelType", "fuel"),
    attrText(attrs, "make", "brand"),
    attrText(attrs, "model"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let boost = 0;
  if (prefs.bodyType && matches(hay, prefs.bodyType)) boost += 2;
  if (prefs.fuelType && matches(hay, prefs.fuelType)) boost += 2;
  if (prefs.make && matches(hay, prefs.make)) boost += 2;
  if (prefs.preferredLocation) {
    const loc = fold(listing.location ?? "");
    if (matches(loc, prefs.preferredLocation)) boost += 3;
  }
  if (
    prefs.maxPriceHint != null &&
    listing.price != null &&
    listing.price <= prefs.maxPriceHint
  ) {
    boost += 1;
  }
  for (const alt of prefs.alternatives ?? []) {
    if (matches(hay, alt)) boost += 2;
  }
  for (const excl of prefs.exclusions ?? []) {
    if (matches(hay, excl)) boost -= 100;
  }
  return boost;
}

/**
 * Stable re-order of an already-eligible listing set by soft-preference boost.
 * Listings with equal boost keep their original relative order. An undefined
 * preference is a no-op (identity order).
 */
export function rankBySoftPreferences<T extends SoftRankableListing>(
  listings: T[],
  prefs: SearchPreference | undefined
): T[] {
  if (!prefs || listings.length < 2) return listings;
  const originalIndex = new Map<T, number>();
  listings.forEach((l, i) => originalIndex.set(l, i));
  const scored = listings.map((l) => ({ l, boost: softPreferenceBoost(l, prefs) }));
  scored.sort(
    (a, b) =>
      b.boost - a.boost ||
      (originalIndex.get(a.l) ?? 0) - (originalIndex.get(b.l) ?? 0)
  );
  return scored.map((s) => s.l);
}

/**
 * R4.2 E — bounded OR fallback over declared alternatives. Each alternative is
 * retrieved SEPARATELY (alternatives are alternatives, never a conjunction),
 * then deduplicated by id and ranked primary-first. Category-neutral: the
 * retrieval callback is injected, so the core has no vertical knowledge.
 */
export async function retrieveAlternativeFallback<T extends SoftRankableListing>(
  alternatives: string[] | undefined,
  retrieve: (query: string) => Promise<T[]>,
  prefs: SearchPreference | undefined,
  cap = 4
): Promise<T[]> {
  if (!alternatives?.length) return [];
  const merged = new Map<string, T>();
  for (const alt of alternatives.slice(0, cap)) {
    let rows: T[];
    try {
      rows = await retrieve(alt);
    } catch {
      continue; // a failed alternative never corrupts the others
    }
    for (const row of rows) {
      if (!merged.has(row.id)) merged.set(row.id, row);
    }
  }
  return rankBySoftPreferences(Array.from(merged.values()), prefs);
}

/**
 * R4.2 — evolve an active preference state without accumulating contradictions.
 * - scalar fields (bodyType/fuelType/make/preferredLocation/maxPriceHint):
 *   the incoming value REPLACES the prior (latest user intent wins);
 * - alternatives: union (deduped, capped), and an incoming alternative that was
 *   previously excluded REMOVES the exclusion (relaxation "gali būti ir X");
 * - exclusions: union (deduped, capped).
 */
export function mergeSearchPreferences(
  prior: SearchPreference | undefined,
  incoming: SearchPreference | undefined
): SearchPreference | undefined {
  if (!incoming) return prior;
  if (!prior) return incoming;

  const alternatives = Array.from(
    new Set([...(prior.alternatives ?? []), ...(incoming.alternatives ?? [])])
  ).slice(0, 6);

  let exclusions = Array.from(
    new Set([...(prior.exclusions ?? []), ...(incoming.exclusions ?? [])])
  );
  // Relaxation: an incoming alternative that was previously excluded is no
  // longer an exclusion.
  const incomingAlt = new Set((incoming.alternatives ?? []).map((a) => fold(a)));
  exclusions = exclusions.filter((e) => !incomingAlt.has(fold(e)));
  exclusions = exclusions.slice(0, 6);

  const merged: SearchPreference = {
    ...(incoming.bodyType !== undefined ? { bodyType: incoming.bodyType } : prior.bodyType ? { bodyType: prior.bodyType } : {}),
    ...(incoming.fuelType !== undefined ? { fuelType: incoming.fuelType } : prior.fuelType ? { fuelType: prior.fuelType } : {}),
    ...(incoming.make !== undefined ? { make: incoming.make } : prior.make ? { make: prior.make } : {}),
    ...(incoming.preferredLocation !== undefined
      ? { preferredLocation: incoming.preferredLocation }
      : prior.preferredLocation
        ? { preferredLocation: prior.preferredLocation }
        : {}),
    ...(incoming.maxPriceHint !== undefined
      ? { maxPriceHint: incoming.maxPriceHint }
      : prior.maxPriceHint !== undefined
        ? { maxPriceHint: prior.maxPriceHint }
        : {}),
    ...(alternatives.length ? { alternatives } : {}),
    ...(exclusions.length ? { exclusions } : {}),
  };

  return Object.keys(merged).length ? merged : undefined;
}
