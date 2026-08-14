/**
 * Electronics attribute map — battery health only when verified/user-confirmed.
 */

import type { CompareAttributeMap, CompareListingRecord } from "../types.js";

export const ELECTRONICS_ATTR_KEYS = [
  "brand",
  "model",
  "storageGb",
  "condition",
  "color",
  "batteryHealthPercent",
  "warrantyMonths",
  "delivery",
  "distanceKm",
] as const;

export function normalizeElectronicsAttributes(
  r: CompareListingRecord
): CompareAttributeMap {
  const battery =
    r.batteryHealthVerified === true &&
    r.batteryHealthPercent != null &&
    Number.isFinite(r.batteryHealthPercent)
      ? r.batteryHealthPercent
      : null;

  return {
    brand: r.brand ?? null,
    model: r.model ?? null,
    storageGb: r.storageGb ?? null,
    condition: r.condition ?? null,
    color: r.color ?? null,
    batteryHealthPercent: battery,
    warrantyMonths: r.warrantyMonths ?? null,
    delivery: r.delivery ?? null,
    distanceKm: r.distanceKm ?? null,
  };
}
