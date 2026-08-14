/**
 * Fact snapshot generation from authorized DB records.
 * Never invents specs; missing → null (N/A).
 */

import {
  normalizeAutomotiveAttributes,
  normalizeElectronicsAttributes,
  normalizeGenericAttributes,
} from "./category-adapters/index.js";
import type { ComparisonListingSnapshot } from "./schema.js";
import type { CompareCategory, CompareListingRecord } from "./types.js";

export function resolveCompareCategory(
  categories: string[]
): CompareCategory {
  const norms = categories.map((c) => c.toLowerCase());
  const allAuto = norms.every(
    (c) => c === "vehicles" || c === "automotive" || c === "auto"
  );
  const allElec = norms.every(
    (c) => c === "electronics" || c === "phones" || c === "phone"
  );
  if (allAuto) return "automotive";
  if (allElec) return "electronics";
  const unique = new Set(norms.map((c) =>
    c === "vehicles" || c === "automotive" || c === "auto"
      ? "automotive"
      : c === "electronics" || c === "phones" || c === "phone"
        ? "electronics"
        : "generic"
  ));
  return unique.size === 1 ? ([...unique][0] as CompareCategory) : "mixed";
}

export function attributesForRecord(
  r: CompareListingRecord,
  mode: CompareCategory
): Record<string, unknown> {
  if (mode === "automotive") return normalizeAutomotiveAttributes(r);
  if (mode === "electronics") return normalizeElectronicsAttributes(r);
  if (mode === "mixed") {
    // Union of relevant keys without inventing
    return {
      ...normalizeGenericAttributes(r),
      year: r.year ?? null,
      mileage: r.mileage ?? null,
      fuel: r.fuel ?? null,
      transmission: r.transmission ?? null,
      storageGb: r.storageGb ?? null,
      warrantyMonths: r.warrantyMonths ?? null,
      batteryHealthPercent:
        r.batteryHealthVerified === true ? r.batteryHealthPercent ?? null : null,
    };
  }
  return normalizeGenericAttributes(r);
}

export function criticalCompareHash(r: CompareListingRecord): string {
  return [
    r.id,
    r.price ?? "",
    r.year ?? "",
    r.mileage ?? "",
    r.brand ?? "",
    r.model ?? "",
    r.storageGb ?? "",
  ].join("|");
}

export function isStaleSnapshot(r: CompareListingRecord): boolean {
  if (
    r.priceSnapshot != null &&
    Number.isFinite(r.priceSnapshot) &&
    r.price != null &&
    r.price !== r.priceSnapshot
  ) {
    return true;
  }
  if (r.criticalHash) {
    return criticalCompareHash(r) !== r.criticalHash;
  }
  return false;
}

export function isAuthorizedListing(
  r: CompareListingRecord,
  requestUserId?: string
): boolean {
  if (r.banned) return false;
  const status = (r.status ?? "active").toLowerCase();
  if (status === "sold" || status === "deleted" || status === "banned" || status === "hidden") {
    return false;
  }
  if (r.visibility === "hidden") return false;
  if (r.visibility === "private") {
    return !!requestUserId && r.ownerUserId === requestUserId;
  }
  return true;
}

export function toComparisonSnapshot(
  r: CompareListingRecord,
  mode: CompareCategory
): ComparisonListingSnapshot {
  return {
    listingId: r.id,
    category: r.category,
    title: r.title,
    askingPrice: r.price,
    currency: r.currency ?? "EUR",
    attributes: attributesForRecord(r, mode),
    vautoScore: r.vautoScore ?? null,
    buyerMatchScore: r.buyerMatchScore ?? null,
    marketRange: r.marketRange ?? null,
    updatedAt: r.updatedAt,
  };
}
