/**
 * Stage 10 catalog adapters — real DB listings → engine record shapes.
 */

import { getListingForEmbedding, getListings } from "../../repository.js";
import type { ApiListing } from "../../types.js";
import type { SearchListingRecord } from "../search/search-schema.js";
import type { MatchListingRecord } from "../../buyer-match/types.js";
import type { CompareListingRecord } from "../../compare-engine/types.js";
import { criticalCompareHash } from "../../compare-engine/listing-normalizer.js";
import { isPublicSearchableListing } from "../search/catalog-filter.js";

function attrStr(
  attrs: ApiListing["attributes"],
  key: string
): string | undefined {
  const v = attrs?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function attrNum(
  attrs: ApiListing["attributes"],
  key: string
): number | undefined {
  const v = attrs?.[key];
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

export function apiListingToSearchRecord(l: ApiListing): SearchListingRecord {
  const attrs = l.attributes;
  return {
    id: l.id,
    title: l.title,
    price: Number(l.price),
    location: l.location,
    category: l.category,
    brand: attrStr(attrs, "brand") ?? attrStr(attrs, "make"),
    model: attrStr(attrs, "model"),
    year: attrNum(attrs, "year"),
    mileage: attrNum(attrs, "mileage") ?? attrNum(attrs, "odometer"),
    condition: attrStr(attrs, "condition"),
    fuel: attrStr(attrs, "fuel"),
    transmission: attrStr(attrs, "transmission"),
    distanceKm: l.distanceKm,
    createdAt: l.createdAt,
    sellerVerified: l.providerVerified || l.vinVerified || undefined,
    status: l.status,
    banned: l.banned,
    requiresReview: l.requiresReview,
    visibility: l.banned || l.requiresReview ? "hidden" : "public",
    ownerUserId: l.sellerId,
  };
}

export async function loadSearchCatalog(): Promise<SearchListingRecord[]> {
  const listings = await getListings();
  return listings
    .map(apiListingToSearchRecord)
    .filter((r) => isPublicSearchableListing(r));
}

export async function loadMatchListingsByIds(
  ids: string[]
): Promise<MatchListingRecord[]> {
  const out: MatchListingRecord[] = [];
  for (const id of ids) {
    const l = await getListingForEmbedding(id);
    if (!l) continue;
    const s = apiListingToSearchRecord(l);
    if (!isPublicSearchableListing(s)) continue;
    out.push({
      id: s.id,
      title: s.title,
      price: s.price,
      location: s.location,
      category: s.category,
      brand: s.brand ?? null,
      model: s.model ?? null,
      year: s.year ?? null,
      mileage: s.mileage ?? null,
      condition: s.condition ?? null,
      fuel: s.fuel ?? null,
      transmission: s.transmission ?? null,
      distanceKm: s.distanceKm ?? null,
      sellerVerified: s.sellerVerified ?? null,
      createdAt: s.createdAt,
    });
  }
  return out;
}

export async function loadCompareListingsByIds(
  ids: string[],
  requestUserId: string
): Promise<CompareListingRecord[]> {
  const out: CompareListingRecord[] = [];
  for (const id of ids) {
    const l = await getListingForEmbedding(id);
    if (!l) continue;
    const publicOk = isPublicSearchableListing(apiListingToSearchRecord(l));
    const ownerOk = l.sellerId === requestUserId;
    if (!publicOk && !ownerOk) continue;
    const attrs = l.attributes;
    const record: CompareListingRecord = {
      id: l.id,
      title: l.title,
      category: l.category,
      price: Number(l.price),
      updatedAt: l.createdAt,
      visibility: publicOk ? "public" : "private",
      status: l.status ?? "active",
      brand: attrStr(attrs, "brand") ?? attrStr(attrs, "make") ?? null,
      model: attrStr(attrs, "model") ?? null,
      year: attrNum(attrs, "year") ?? null,
      mileage: attrNum(attrs, "mileage") ?? null,
      distanceKm: l.distanceKm,
      ownerUserId: l.sellerId,
      priceSnapshot: Number(l.price),
      criticalHash: "",
    };
    record.criticalHash = criticalCompareHash(record);
    out.push(record);
  }
  return out;
}
