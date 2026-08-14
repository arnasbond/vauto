/**
 * Category attribute maps — missing → null (N/A). Never invent values.
 */

import type { CompareAttributeMap, CompareListingRecord } from "../types.js";

export const AUTOMOTIVE_ATTR_KEYS = [
  "brand",
  "model",
  "year",
  "mileage",
  "fuel",
  "transmission",
  "drivetrain",
  "bodyType",
  "condition",
  "color",
  "distanceKm",
  "delivery",
] as const;

export function normalizeAutomotiveAttributes(
  r: CompareListingRecord
): CompareAttributeMap {
  return {
    brand: r.brand ?? null,
    model: r.model ?? null,
    year: r.year ?? null,
    mileage: r.mileage ?? null,
    fuel: r.fuel ?? null,
    transmission: r.transmission ?? null,
    drivetrain: r.drivetrain ?? null,
    bodyType: r.bodyType ?? null,
    condition: r.condition ?? null,
    color: r.color ?? null,
    distanceKm: r.distanceKm ?? null,
    delivery: r.delivery ?? null,
  };
}
