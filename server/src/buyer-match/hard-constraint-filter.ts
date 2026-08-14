/**
 * Hard constraint filter — 100% enforcement of 10B SearchQuery constraints.
 * Violators are NEVER eligible for primary Buyer Match ranking.
 */

import {
  filterListingsByQuery,
  isPublicSearchableListing,
} from "../ai/search/catalog-filter.js";
import type { SearchListingRecord, SearchQuery } from "../ai/search/search-schema.js";
import type { MatchListingRecord } from "./types.js";

export type HardFilterOutcome = {
  eligible: boolean;
  violations: string[];
};

function toSearchRecord(l: MatchListingRecord): SearchListingRecord {
  return {
    id: l.id,
    title: l.title,
    price: l.price,
    location: l.location,
    category: l.category,
    brand: l.brand,
    model: l.model,
    year: l.year,
    mileage: l.mileage,
    condition: l.condition,
    fuel: l.fuel,
    transmission: l.transmission,
    delivery: l.delivery,
    distanceKm: l.distanceKm,
    createdAt: l.createdAt ?? new Date(0).toISOString(),
    sellerVerified: l.sellerVerified ?? undefined,
  };
}

/**
 * Re-check a single listing against hard SearchQuery (budget, year, radius, …).
 */
export function evaluateHardConstraints(
  listing: MatchListingRecord,
  query: SearchQuery
): HardFilterOutcome {
  const rec = toSearchRecord(listing);
  if (!isPublicSearchableListing(rec)) {
    return { eligible: false, violations: ["NOT_PUBLIC_SEARCHABLE"] };
  }

  const passed = filterListingsByQuery([rec], query);
  if (passed.length === 1) {
    return { eligible: true, violations: [] };
  }

  const violations: string[] = [];
  const norm = (s: string | null | undefined) =>
    String(s ?? "").toLowerCase().normalize("NFC").trim();

  if (query.category && norm(listing.category) !== norm(query.category)) {
    violations.push("CATEGORY");
  }
  if (query.brand && norm(listing.brand) !== norm(query.brand)) {
    violations.push("BRAND");
  }
  if (query.priceMax != null && listing.price > query.priceMax) {
    violations.push("BUDGET_MAX");
  }
  if (query.priceMin != null && listing.price < query.priceMin) {
    violations.push("BUDGET_MIN");
  }
  if (query.yearMin != null && (listing.year == null || listing.year < query.yearMin)) {
    violations.push("YEAR_MIN");
  }
  if (query.yearMax != null && (listing.year == null || listing.year > query.yearMax)) {
    violations.push("YEAR_MAX");
  }
  if (
    query.mileageMax != null &&
    (listing.mileage == null || listing.mileage > query.mileageMax)
  ) {
    violations.push("MILEAGE_MAX");
  }
  if (query.radiusKm != null) {
    if (listing.distanceKm == null || listing.distanceKm > query.radiusKm) {
      violations.push("RADIUS");
    }
  }
  if (violations.length === 0) violations.push("HARD_CONSTRAINT");
  return { eligible: false, violations };
}

/**
 * Keep only listings whose ids are in the 10B candidate set AND pass hard filters.
 */
export function filterHardEligible(
  listings: MatchListingRecord[],
  candidateListingIds: string[],
  query: SearchQuery
): {
  eligible: MatchListingRecord[];
  ineligible: Array<{ listing: MatchListingRecord; violations: string[] }>;
  unknownIds: string[];
} {
  const allowed = new Set(candidateListingIds);
  const byId = new Map(listings.map((l) => [l.id, l]));
  const unknownIds = candidateListingIds.filter((id) => !byId.has(id));

  const eligible: MatchListingRecord[] = [];
  const ineligible: Array<{ listing: MatchListingRecord; violations: string[] }> = [];

  for (const id of candidateListingIds) {
    const listing = byId.get(id);
    if (!listing) continue;
    // Hallucination guard: only evaluate ids from the provided candidate set
    if (!allowed.has(id)) {
      ineligible.push({ listing, violations: ["NOT_IN_CANDIDATE_SET"] });
      continue;
    }
    const outcome = evaluateHardConstraints(listing, query);
    if (outcome.eligible) eligible.push(listing);
    else ineligible.push({ listing, violations: outcome.violations });
  }

  // Any listing in catalog but NOT in candidateListingIds must never be ranked
  for (const l of listings) {
    if (!allowed.has(l.id)) {
      // ignore — not evaluated
    }
  }

  return { eligible, ineligible, unknownIds };
}

/**
 * Revalidation: if price or critical fields drifted since 10B snapshot → ineligible.
 */
export function revalidateListing(listing: MatchListingRecord): {
  ok: boolean;
  reason?: string;
} {
  if (
    listing.priceSnapshot != null &&
    Number.isFinite(listing.priceSnapshot) &&
    listing.price !== listing.priceSnapshot
  ) {
    return { ok: false, reason: "PRICE_CHANGED" };
  }
  if (listing.criticalHash) {
    const hash = criticalListingHash(listing);
    if (hash !== listing.criticalHash) {
      return { ok: false, reason: "CRITICAL_FIELDS_CHANGED" };
    }
  }
  return { ok: true };
}

export function criticalListingHash(listing: MatchListingRecord): string {
  return [
    listing.id,
    listing.price,
    listing.year ?? "",
    listing.mileage ?? "",
    listing.brand ?? "",
    listing.model ?? "",
  ].join("|");
}
