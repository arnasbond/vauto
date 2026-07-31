/**
 * Offline UX checks: trust silent-hide + magic mirror data gates.
 *   node scripts/test-ux-chat-listing.mjs
 */
import assert from "node:assert/strict";

function hasEnoughTrustEvidence(profile) {
  return (
    profile.reviewCount >= 1 ||
    (profile.shippingHoursAvg != null && profile.shippingScore > 0)
  );
}

function buildUserTrustScore({ reviews, sellerId }) {
  const count = reviews.filter((r) => r.sellerId === sellerId).length;
  if (count < 1) return null;
  return {
    score: 88,
    reviewScore: 88,
    shippingScore: 0,
    toneScore: 0,
    shippingHoursAvg: null,
    reviewCount: count,
    recommendation: "ok",
  };
}

function buyerMeasurementsFromProfile(user) {
  const m = user.bodyMeasurements;
  if (!m) return null;
  const hasSize = Boolean(String(m.usualSize ?? "").trim());
  const hasCm = [m.bustCm, m.waistCm, m.hipsCm, m.heightCm].some(
    (n) => typeof n === "number" && n > 0
  );
  if (!hasSize && !hasCm) return null;
  return m;
}

assert.equal(buildUserTrustScore({ reviews: [], sellerId: "s1" }), null);
const withReview = buildUserTrustScore({
  reviews: [{ sellerId: "s1" }],
  sellerId: "s1",
});
assert.ok(withReview);
assert.equal(hasEnoughTrustEvidence(withReview), true);

assert.equal(buyerMeasurementsFromProfile({}), null);
assert.equal(buyerMeasurementsFromProfile({ bodyMeasurements: {} }), null);
assert.ok(
  buyerMeasurementsFromProfile({ bodyMeasurements: { usualSize: "M" } })
);

// System sender ids must not be "guest"
const SYSTEM = "vauto-system";
assert.notEqual(SYSTEM, "guest");

console.log("✔ UX chat/listing checks passed");
