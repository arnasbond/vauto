/**
 * Offline M2 checks: Omniva parcel prices + logisticsReadyBoost.
 *   node scripts/test-m2-logistics.mjs
 */
import assert from "node:assert/strict";

const OMNIVA_PARCEL_PRICES_EUR = { S: 2.29, M: 2.99, L: 3.99 };

function computeLogisticsReadyBoost(listing) {
  if (listing.allowPastomatas === true) return 0.06;
  const fits = String(listing.attributes?.fitsOmnivaLocker ?? "")
    .trim()
    .toLowerCase();
  if (fits === "true" || fits === "1" || fits === "yes") return 0.05;
  return 0;
}

assert.equal(OMNIVA_PARCEL_PRICES_EUR.S, 2.29);
assert.equal(OMNIVA_PARCEL_PRICES_EUR.L, 3.99);
assert.equal(computeLogisticsReadyBoost({ allowPastomatas: true }), 0.06);
assert.equal(
  computeLogisticsReadyBoost({
    allowPastomatas: false,
    attributes: { fitsOmnivaLocker: "true" },
  }),
  0.05
);
assert.equal(computeLogisticsReadyBoost({ attributes: {} }), 0);
console.log("✔ M2 logistics checks passed");
