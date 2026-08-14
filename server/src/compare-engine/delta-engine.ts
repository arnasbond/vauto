/**
 * Deterministic numeric deltas between compared listings.
 * null attribute → no numeric delta for that pair/field.
 */

import type { ComparisonListingSnapshot } from "./schema.js";
import type { DeltaKey } from "./types.js";

export type PairDelta = {
  aListingId: string;
  bListingId: string;
  value: number;
};

export type DeltaMap = Partial<Record<DeltaKey, PairDelta[]>>;

function numAttr(
  snap: ComparisonListingSnapshot,
  key: string
): number | null {
  const v = snap.attributes[key];
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function pairwiseDiff(
  listings: ComparisonListingSnapshot[],
  getValue: (s: ComparisonListingSnapshot) => number | null
): PairDelta[] {
  const out: PairDelta[] = [];
  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      const a = getValue(listings[i]);
      const b = getValue(listings[j]);
      if (a == null || b == null) continue; // null cannot produce numeric delta
      out.push({
        aListingId: listings[i].listingId,
        bListingId: listings[j].listingId,
        value: Math.round((a - b) * 1000) / 1000,
      });
    }
  }
  return out;
}

export function computeDeltas(
  listings: ComparisonListingSnapshot[]
): DeltaMap {
  const deltas: DeltaMap = {};

  const price = pairwiseDiff(listings, (s) => s.askingPrice);
  if (price.length) deltas.PRICE_DIFF_EUR = price;

  const mileage = pairwiseDiff(listings, (s) => numAttr(s, "mileage"));
  if (mileage.length) deltas.MILEAGE_DIFF_KM = mileage;

  const year = pairwiseDiff(listings, (s) => numAttr(s, "year"));
  if (year.length) deltas.YEAR_DIFF = year;

  const distance = pairwiseDiff(listings, (s) => numAttr(s, "distanceKm"));
  if (distance.length) deltas.DISTANCE_DIFF_KM = distance;

  const vauto = pairwiseDiff(listings, (s) =>
    s.vautoScore != null && Number.isFinite(s.vautoScore) ? s.vautoScore : null
  );
  if (vauto.length) deltas.VAUTO_SCORE_DIFF = vauto;

  const match = pairwiseDiff(listings, (s) =>
    s.buyerMatchScore != null && Number.isFinite(s.buyerMatchScore)
      ? s.buyerMatchScore
      : null
  );
  if (match.length) deltas.BUYER_MATCH_DIFF = match;

  const storage = pairwiseDiff(listings, (s) => numAttr(s, "storageGb"));
  if (storage.length) deltas.STORAGE_DIFF_GB = storage;

  return deltas;
}

/** Flatten all deterministic numeric facts for explanation guard. */
export function collectDeterministicNumbers(
  listings: ComparisonListingSnapshot[],
  deltas: DeltaMap
): Set<number> {
  const s = new Set<number>();
  for (const l of listings) {
    if (l.askingPrice != null) s.add(l.askingPrice);
    if (l.vautoScore != null) s.add(l.vautoScore);
    if (l.buyerMatchScore != null) s.add(l.buyerMatchScore);
    if (l.marketRange) {
      s.add(l.marketRange.low);
      s.add(l.marketRange.median);
      s.add(l.marketRange.high);
    }
    for (const v of Object.values(l.attributes)) {
      if (typeof v === "number" && Number.isFinite(v)) s.add(v);
    }
  }
  for (const pairs of Object.values(deltas)) {
    if (!pairs) continue;
    for (const p of pairs) {
      s.add(p.value);
      s.add(Math.abs(p.value));
    }
  }
  s.add(listings.length);
  return s;
}
