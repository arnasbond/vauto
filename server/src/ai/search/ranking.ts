/**
 * Deterministic ranking for NL Search 10B.
 * Order: brand/model match → hard-filter fit → distance → recency → price → verified seller.
 * Does NOT use VAUTO Score / Match (10E/10F not built yet).
 */

import type { SearchHit, SearchListingRecord, SearchQuery } from "./search-schema.js";

function norm(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().normalize("NFC");
}

export function scoreListing(l: SearchListingRecord, query: SearchQuery): number {
  let score = 0;

  if (query.brand && norm(l.brand) === norm(query.brand)) score += 100;
  if (query.model && (norm(l.model).includes(norm(query.model)) || norm(l.title).includes(norm(query.model)))) {
    score += 80;
  }
  if (query.category && norm(l.category) === norm(query.category)) score += 40;
  if (query.fuel && norm(l.fuel) === norm(query.fuel)) score += 20;
  if (query.transmission && norm(l.transmission) === norm(query.transmission)) score += 20;
  if (query.location && norm(l.location).includes(norm(query.location))) score += 25;

  // Distance: closer is better only when known
  if (l.distanceKm != null && Number.isFinite(l.distanceKm)) {
    score += Math.max(0, 30 - Math.min(30, l.distanceKm));
  }

  // Recency (newer → higher); createdAt ISO
  const ts = Date.parse(l.createdAt);
  if (Number.isFinite(ts)) {
    const ageDays = (Date.now() - ts) / 86_400_000;
    score += Math.max(0, 20 - Math.min(20, ageDays / 7));
  }

  // Prefer lower price slightly when no sort override (within matches)
  if (l.price > 0) {
    score += Math.max(0, 15 - Math.min(15, l.price / 5000));
  }

  if (l.sellerVerified) score += 10;

  return Math.round(score * 100) / 100;
}

export function rankListings(
  listings: SearchListingRecord[],
  query: SearchQuery
): SearchHit[] {
  const scored = listings.map((l) => ({
    listing: l,
    score: scoreListing(l, query),
  }));

  const sort = query.sort ?? "relevance";
  scored.sort((a, b) => {
    if (sort === "price_asc") return a.listing.price - b.listing.price;
    if (sort === "price_desc") return b.listing.price - a.listing.price;
    if (sort === "newest") {
      return Date.parse(b.listing.createdAt) - Date.parse(a.listing.createdAt);
    }
    if (sort === "distance") {
      const da = a.listing.distanceKm;
      const db = b.listing.distanceKm;
      if (da == null && db == null) return b.score - a.score;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    }
    // relevance
    if (b.score !== a.score) return b.score - a.score;
    return Date.parse(b.listing.createdAt) - Date.parse(a.listing.createdAt);
  });

  return scored.map(({ listing: l, score }) => ({
    id: l.id,
    score,
    title: l.title,
    price: l.price,
    location: l.location,
    category: l.category,
    distanceKm: l.distanceKm ?? null,
  }));
}
