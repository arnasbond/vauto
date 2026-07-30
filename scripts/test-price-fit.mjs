/**
 * Offline check: computePriceFitBoost peaks near appraisal optimal.
 *   node scripts/test-price-fit.mjs
 */
import assert from "node:assert/strict";

function computePriceFitBoost(listing) {
  const attrs = listing.attributes ?? {};
  const optimal = Number(
    attrs.appraisalOptimalPrice ?? attrs.optimalPrice ?? attrs.marketMedianPrice ?? 0
  );
  const price = Number(listing.price ?? 0);
  if (!(optimal > 0) || !(price > 0)) return 0;
  const ratio = price / optimal;
  let fit = 0;
  if (ratio >= 0.85 && ratio <= 1.15) fit = 0.08;
  else if (ratio >= 0.7 && ratio <= 1.3) fit = 0.04;
  else if (ratio >= 0.55 && ratio <= 1.5) fit = 0.015;
  else return 0;
  const score = Number(attrs.appraisalScore ?? 0);
  const confidence = score > 0 ? Math.min(1, Math.max(0.35, score / 100)) : 0.6;
  return fit * confidence;
}

assert.equal(computePriceFitBoost({ price: 1000, attributes: {} }), 0);
const near = computePriceFitBoost({
  price: 1000,
  attributes: { appraisalOptimalPrice: "1000", appraisalScore: "80" },
});
assert.ok(near > 0.05 && near <= 0.08, `near=${near}`);
const far = computePriceFitBoost({
  price: 3000,
  attributes: { appraisalOptimalPrice: "1000", appraisalScore: "80" },
});
assert.equal(far, 0);
console.log("✔ priceFitBoost checks passed");
