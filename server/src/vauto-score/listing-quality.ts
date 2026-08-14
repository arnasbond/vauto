/**
 * Listing quality — photos, attributes, description usefulness.
 * Missing signals → null component score (N/A), never fake 50.
 */

import type { ListingQualityInput, ReasonCode, ScoreComponent } from "./types.js";
import { SCORE_WEIGHTS } from "./types.js";

const DEFAULT_EXPECTED = ["brand", "model", "condition", "category"];

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function scoreListingQuality(listing: ListingQualityInput | null | undefined): {
  component: ScoreComponent;
  missing: string[];
} {
  const weight = SCORE_WEIGHTS.listingQuality;
  const missing: string[] = [];
  const reasons: ReasonCode[] = [];

  if (!listing) {
    missing.push("listing");
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: [] },
      missing,
    };
  }

  const hasPhotos = listing.photoCount != null && Number.isFinite(listing.photoCount);
  const hasAttrs =
    listing.presentAttributeKeys != null || listing.expectedAttributeKeys != null;
  const hasDesc = listing.descriptionLength != null && Number.isFinite(listing.descriptionLength);

  if (!hasPhotos && !hasAttrs && !hasDesc) {
    missing.push("listing.photos", "listing.attributes", "listing.description");
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: [] },
      missing,
    };
  }

  let photoScore: number | null = null;
  if (hasPhotos) {
    const n = Math.max(0, listing.photoCount!);
    if (n === 0) {
      photoScore = 15;
      reasons.push("NO_PHOTOS");
    } else if (n <= 2) {
      photoScore = 45;
      reasons.push("LIMITED_PHOTO_SET");
    } else if (n <= 5) {
      photoScore = 75;
      reasons.push("ADEQUATE_PHOTO_SET");
    } else {
      photoScore = 95;
      reasons.push("RICH_PHOTO_SET");
    }
  } else {
    missing.push("listing.photos");
  }

  let attrScore: number | null = null;
  if (hasAttrs) {
    const expected = listing.expectedAttributeKeys?.length
      ? listing.expectedAttributeKeys
      : DEFAULT_EXPECTED;
    const present = new Set(
      (listing.presentAttributeKeys ?? []).map((k) => k.toLowerCase())
    );
    const hit = expected.filter((k) => present.has(k.toLowerCase())).length;
    const ratio = expected.length > 0 ? hit / expected.length : 0;
    attrScore = clampScore(ratio * 100);
    if (ratio >= 0.85) reasons.push("COMPLETE_ATTRIBUTES");
    else if (ratio >= 0.5) reasons.push("PARTIAL_ATTRIBUTES");
    else reasons.push("SPARSE_ATTRIBUTES");
  } else {
    missing.push("listing.attributes");
  }

  let descScore: number | null = null;
  if (hasDesc) {
    const len = Math.max(0, listing.descriptionLength!);
    if (len < 20) {
      descScore = 20;
      reasons.push(len === 0 ? "MISSING_DESCRIPTION" : "THIN_DESCRIPTION");
    } else if (len < 80) {
      descScore = 55;
      reasons.push("THIN_DESCRIPTION");
    } else {
      descScore = 90;
      reasons.push("USEFUL_DESCRIPTION");
    }
  } else {
    missing.push("listing.description");
  }

  const parts = [photoScore, attrScore, descScore].filter(
    (x): x is number => x != null
  );
  if (parts.length === 0) {
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: reasons },
      missing,
    };
  }

  const score = clampScore(parts.reduce((a, b) => a + b, 0) / parts.length);
  const confidence = parts.length / 3;

  return {
    component: { score, weight, confidence, reasonCodes: reasons },
    missing,
  };
}
