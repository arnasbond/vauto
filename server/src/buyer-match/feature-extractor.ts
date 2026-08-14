/**
 * Extract match feature components for an eligible listing.
 * UNKNOWN !== NEGATIVE: missing signals yield null component (lower confidence), not auto-penalty.
 */

import type { SearchQuery } from "../ai/search/search-schema.js";
import type {
  BuyerPreferences,
  MatchFeatureVector,
  MatchListingRecord,
  ReasonCode,
  TradeoffCode,
} from "./types.js";

function norm(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().normalize("NFC").trim();
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function extractMatchFeatures(
  listing: MatchListingRecord,
  hard: SearchQuery,
  soft: BuyerPreferences
): MatchFeatureVector {
  const reasons: ReasonCode[] = [];
  const tradeoffs: TradeoffCode[] = [];

  // --- budgetFit ---
  let budgetFit: number | null = null;
  if (hard.priceMax != null && Number.isFinite(listing.price)) {
    const max = hard.priceMax;
    const min = hard.priceMin ?? 0;
    if (listing.price > max) {
      budgetFit = 0;
    } else {
      const span = Math.max(1, max - min);
      const room = (max - listing.price) / span;
      budgetFit = clamp01(0.55 + room * 0.45);
      reasons.push("WITHIN_BUDGET");
      const comfort = soft.budgetComfortRatio ?? 0.9;
      if (listing.price >= max * comfort) {
        tradeoffs.push("PRICE_NEAR_BUDGET_LIMIT");
      }
    }
  } else if (Number.isFinite(listing.price)) {
    budgetFit = 0.7; // no hard budget — neutral-positive presence
  }

  // --- ageFit (vehicle year) ---
  let ageFit: number | null = null;
  const yearPrefMin = soft.preferredYearMin ?? hard.yearMin;
  const yearPrefMax = soft.preferredYearMax ?? hard.yearMax;
  if (listing.year == null) {
    ageFit = null; // unknown ≠ negative
  } else if (yearPrefMin != null || yearPrefMax != null) {
    const lo = yearPrefMin ?? 1950;
    const hi = yearPrefMax ?? new Date().getFullYear() + 1;
    if (listing.year >= lo && listing.year <= hi) {
      ageFit = 0.9;
      reasons.push("YEAR_WITHIN_PREFERENCE");
    } else if (listing.year < lo) {
      ageFit = clamp01(1 - (lo - listing.year) / 10);
      tradeoffs.push("OLDER_YEAR_THAN_PREFERRED");
    } else {
      ageFit = 0.75;
    }
  } else {
    ageFit = 0.75;
  }

  // --- mileageFit ---
  let mileageFit: number | null = null;
  const mileCap = soft.preferredMileageMax ?? hard.mileageMax;
  if (listing.mileage == null) {
    mileageFit = null;
    tradeoffs.push("MISSING_MILEAGE_SIGNAL");
  } else if (mileCap != null) {
    if (listing.mileage <= mileCap) {
      mileageFit = clamp01(1 - listing.mileage / Math.max(mileCap, 1) * 0.35);
      reasons.push("LOW_MILEAGE_FIT");
    } else {
      mileageFit = clamp01(0.4 - (listing.mileage - mileCap) / mileCap);
    }
  } else {
    mileageFit = clamp01(1 - Math.min(listing.mileage, 300_000) / 300_000);
  }

  // --- distanceFit ---
  let distanceFit: number | null = null;
  const distCap = soft.preferredMaxDistanceKm ?? hard.radiusKm;
  if (listing.distanceKm == null) {
    distanceFit = null;
    tradeoffs.push("MISSING_DISTANCE_SIGNAL");
  } else if (distCap != null) {
    distanceFit = clamp01(1 - listing.distanceKm / distCap);
    if (listing.distanceKm <= distCap * 0.35) reasons.push("LOW_DISTANCE");
  } else {
    distanceFit = clamp01(1 - listing.distanceKm / 200);
    if (listing.distanceKm <= 30) reasons.push("LOW_DISTANCE");
  }

  // --- preferenceFit (brand/model/color/condition/fuel/transmission) ---
  const prefParts: number[] = [];
  if (soft.preferredBrands?.length) {
    const hit = soft.preferredBrands.some((b) => norm(b) === norm(listing.brand));
    prefParts.push(hit ? 1 : 0.2);
    if (hit) reasons.push("EXACT_BRAND_MATCH");
  }
  if (soft.preferredModels?.length) {
    const hit = soft.preferredModels.some(
      (m) =>
        norm(listing.model).includes(norm(m)) || norm(listing.title).includes(norm(m))
    );
    prefParts.push(hit ? 1 : 0.15);
    if (hit) reasons.push("EXACT_MODEL_MATCH");
  }
  if (soft.preferredColors?.length) {
    if (listing.color == null || norm(listing.color) === "") {
      tradeoffs.push("MISSING_COLOR_SIGNAL");
      // unknown — do not push a low part
    } else {
      const hit = soft.preferredColors.some((c) => norm(c) === norm(listing.color));
      prefParts.push(hit ? 1 : 0.25);
      if (hit) reasons.push("COLOR_PREFERENCE_MATCH");
    }
  }
  if (soft.preferredConditions?.length && listing.condition) {
    const hit = soft.preferredConditions.some((c) => norm(c) === norm(listing.condition));
    prefParts.push(hit ? 1 : 0.3);
    if (hit) reasons.push("CONDITION_PREFERENCE_MATCH");
  }
  if (soft.preferredFuel?.length) {
    if (!listing.fuel) {
      /* unknown — skip */
    } else {
      const hit = soft.preferredFuel.some((f) => norm(f) === norm(listing.fuel));
      prefParts.push(hit ? 1 : 0.25);
      if (hit) reasons.push("FUEL_PREFERENCE_MATCH");
    }
  }
  if (soft.preferredTransmission?.length) {
    if (!listing.transmission) {
      /* unknown */
    } else {
      const hit = soft.preferredTransmission.some(
        (t) => norm(t) === norm(listing.transmission)
      );
      prefParts.push(hit ? 1 : 0.25);
      if (hit) reasons.push("TRANSMISSION_PREFERENCE_MATCH");
    }
  }

  let preferenceFit: number | null = null;
  if (prefParts.length === 0) {
    preferenceFit = null; // no soft prefs stated
  } else {
    preferenceFit = prefParts.reduce((a, b) => a + b, 0) / prefParts.length;
    if (preferenceFit >= 0.75) reasons.push("SOFT_PREFERENCE_ALIGNED");
    else tradeoffs.push("SOFT_PREFERENCE_PARTIAL");
  }

  // --- vautoScoreFit ---
  let vautoScoreFit: number | null = null;
  if (listing.vautoScore != null && Number.isFinite(listing.vautoScore)) {
    vautoScoreFit = clamp01(listing.vautoScore / 100);
    if (listing.vautoScore >= 75) reasons.push("STRONG_VAUTO_SCORE");
  }

  // --- sellerSignalFit ---
  let sellerSignalFit: number | null = null;
  if (listing.sellerVerified != null) {
    sellerSignalFit = listing.sellerVerified ? 0.95 : 0.55;
    if (listing.sellerVerified) reasons.push("VERIFIED_SELLER_SIGNAL");
  }

  // --- deliveryFit ---
  let deliveryFit: number | null = null;
  if (soft.preferDelivery === true) {
    if (listing.delivery == null) {
      deliveryFit = null;
      tradeoffs.push("MISSING_DELIVERY_SIGNAL");
    } else if (listing.delivery.length > 0) {
      deliveryFit = 0.95;
      reasons.push("DELIVERY_AVAILABLE");
    } else {
      deliveryFit = 0.25;
      tradeoffs.push("DELIVERY_NOT_AVAILABLE");
    }
  } else if (listing.delivery != null) {
    deliveryFit = listing.delivery.length > 0 ? 0.8 : 0.5;
    if (listing.delivery.length > 0) reasons.push("DELIVERY_AVAILABLE");
  }

  const components = [
    budgetFit,
    ageFit,
    mileageFit,
    distanceFit,
    preferenceFit,
    vautoScoreFit,
    sellerSignalFit,
    deliveryFit,
  ];
  const known = components.filter((c) => c != null).length;
  const dataCoverage = known / components.length;

  // Convert 0–1 fits to 0–100 scale for scorer clarity
  const to100 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 10);

  return {
    listingId: listing.id,
    budgetFit: to100(budgetFit),
    ageFit: to100(ageFit),
    mileageFit: to100(mileageFit),
    distanceFit: to100(distanceFit),
    preferenceFit: to100(preferenceFit),
    vautoScoreFit: to100(vautoScoreFit),
    sellerSignalFit: to100(sellerSignalFit),
    deliveryFit: to100(deliveryFit),
    reasons: [...new Set(reasons)],
    tradeoffs: [...new Set(tradeoffs)],
    dataCoverage,
  };
}
