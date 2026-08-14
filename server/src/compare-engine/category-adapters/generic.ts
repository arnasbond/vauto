/**
 * Generic category attribute map.
 */

import type { CompareAttributeMap, CompareListingRecord } from "../types.js";

export const GENERIC_ATTR_KEYS = [
  "brand",
  "model",
  "condition",
  "color",
  "delivery",
  "distanceKm",
] as const;

export function normalizeGenericAttributes(
  r: CompareListingRecord
): CompareAttributeMap {
  return {
    brand: r.brand ?? null,
    model: r.model ?? null,
    condition: r.condition ?? null,
    color: r.color ?? null,
    delivery: r.delivery ?? null,
    distanceKm: r.distanceKm ?? null,
  };
}
