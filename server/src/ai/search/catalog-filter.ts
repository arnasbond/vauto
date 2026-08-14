/**
 * Deterministic catalog filter — HARD constraints never silently widened.
 * Visibility: public only; banned / review / sold / hidden / private excluded.
 */

import type { SearchListingRecord, SearchQuery } from "./search-schema.js";

export function isPublicSearchableListing(l: SearchListingRecord): boolean {
  if (l.banned) return false;
  if (l.requiresReview) return false;
  if (l.visibility === "private" || l.visibility === "hidden") return false;
  const status = (l.status ?? "active").toLowerCase();
  if (status === "sold" || status === "deleted" || status === "banned" || status === "hidden") {
    return false;
  }
  return true;
}

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFC")
    .trim();
}

/**
 * Apply SearchQuery as hard filters. Distance only when listing.distanceKm is known;
 * never invent distances for unknown coordinates.
 */
export function filterListingsByQuery(
  catalog: SearchListingRecord[],
  query: SearchQuery
): SearchListingRecord[] {
  return catalog.filter((l) => {
    if (!isPublicSearchableListing(l)) return false;

    if (query.category && norm(l.category) !== norm(query.category)) return false;
    if (query.brand && norm(l.brand) !== norm(query.brand)) return false;
    if (query.model && !norm(l.model).includes(norm(query.model)) && !norm(l.title).includes(norm(query.model))) {
      return false;
    }
    if (query.priceMin != null && l.price < query.priceMin) return false;
    if (query.priceMax != null && l.price > query.priceMax) return false;
    if (query.yearMin != null && (l.year == null || l.year < query.yearMin)) return false;
    if (query.yearMax != null && (l.year == null || l.year > query.yearMax)) return false;
    if (query.mileageMax != null && (l.mileage == null || l.mileage > query.mileageMax)) {
      return false;
    }
    if (query.location && !norm(l.location).includes(norm(query.location))) return false;
    if (query.radiusKm != null) {
      // Unknown distance → cannot satisfy radius hard constraint (do not invent).
      if (l.distanceKm == null || !Number.isFinite(l.distanceKm)) return false;
      if (l.distanceKm > query.radiusKm) return false;
    }
    if (query.condition?.length) {
      const c = norm(l.condition);
      if (!query.condition.some((x) => norm(x) === c)) return false;
    }
    if (query.fuel && norm(l.fuel) !== norm(query.fuel)) return false;
    if (query.transmission && norm(l.transmission) !== norm(query.transmission)) {
      return false;
    }
    if (query.delivery?.length) {
      const d = (l.delivery ?? []).map(norm);
      if (!query.delivery.every((x) => d.includes(norm(x)))) return false;
    }
    if (query.keywords) {
      const hay = norm(`${l.title} ${l.brand ?? ""} ${l.model ?? ""}`);
      const tokens = query.keywords
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
      if (tokens.length) {
        // Soft when structured brand/model already constrain the set.
        if (query.brand || query.model) {
          if (!tokens.some((t) => hay.includes(norm(t)))) {
            // allow miss — structured filters dominate
          }
        } else if (!tokens.every((t) => hay.includes(norm(t)))) {
          return false;
        }
      }
    }
    return true;
  });
}

/** Post-condition: every hit must satisfy hard constraints (audit helper). */
export function assertHardConstraintsPreserved(
  hits: SearchListingRecord[],
  query: SearchQuery
): boolean {
  return hits.every((l) => {
    if (query.priceMax != null && l.price > query.priceMax) return false;
    if (query.priceMin != null && l.price < query.priceMin) return false;
    if (query.yearMin != null && (l.year == null || l.year < query.yearMin)) return false;
    if (query.yearMax != null && (l.year == null || l.year > query.yearMax)) return false;
    if (query.brand && norm(l.brand) !== norm(query.brand)) return false;
    if (query.model && !norm(l.model).includes(norm(query.model)) && !norm(l.title).includes(norm(query.model))) {
      return false;
    }
    if (query.category && norm(l.category) !== norm(query.category)) return false;
    if (query.radiusKm != null) {
      if (l.distanceKm == null || l.distanceKm > query.radiusKm) return false;
    }
    return true;
  });
}
