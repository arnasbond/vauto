/**
 * Offline AI Preference Center / Magic Mirror mapping checks.
 *   node scripts/test-ai-preference-profile.mjs
 */
import assert from "node:assert/strict";

function parsePrimaryVehicle(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const make = String(raw.make ?? "").trim();
  const model = String(raw.model ?? "").trim();
  const year = Number(raw.year);
  if (!make || !model || !Number.isFinite(year) || year < 1950) return undefined;
  return { make, model, year: Math.floor(year) };
}

function formToPreferencesPayload(form) {
  const clothingSize = form.clothingSize.trim();
  const shoeSizeEu = form.shoeSizeEu.trim();
  const bodyMeasurements = {};
  if (clothingSize) bodyMeasurements.usualSize = clothingSize;
  if (shoeSizeEu) bodyMeasurements.shoeSizeEu = shoeSizeEu;
  const vehicle = parsePrimaryVehicle({
    make: form.vehicleMake,
    model: form.vehicleModel,
    year: form.vehicleYear,
  });
  const purchasePrefs = form.purchasePrefsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    clothingSize: clothingSize || undefined,
    shoeSizeEu: shoeSizeEu || undefined,
    bodyMeasurements,
    primaryVehicle: vehicle ?? null,
    purchasePrefs,
  };
}

function userPatchFromPreferences(prefs) {
  const bm = { ...(prefs.bodyMeasurements ?? {}) };
  if (prefs.clothingSize) bm.usualSize = prefs.clothingSize;
  if (prefs.shoeSizeEu) bm.shoeSizeEu = prefs.shoeSizeEu;
  const patch = {};
  if (Object.keys(bm).length) patch.bodyMeasurements = bm;
  const vehicle = parsePrimaryVehicle(prefs.primaryVehicle);
  if (vehicle) patch.primaryVehicle = vehicle;
  if (prefs.purchasePrefs?.length) patch.hobbies = prefs.purchasePrefs;
  return patch;
}

function hasAiTwinFitData(user) {
  const m = user.bodyMeasurements;
  if (!m) return false;
  return Boolean(String(m.usualSize ?? "").trim()) || typeof m.bustCm === "number";
}

function buyerMeasurementsFromProfile(user) {
  if (!hasAiTwinFitData(user)) return null;
  return user.bodyMeasurements ?? null;
}

const payload = formToPreferencesPayload({
  clothingSize: "M",
  shoeSizeEu: "42",
  vehicleMake: "VW",
  vehicleModel: "Golf",
  vehicleYear: "2018",
  purchasePrefsRaw: "dviračiai, vintage",
});
assert.equal(payload.clothingSize, "M");
assert.equal(payload.shoeSizeEu, "42");
assert.equal(payload.primaryVehicle.make, "VW");
assert.deepEqual(payload.purchasePrefs, ["dviračiai", "vintage"]);

const patch = userPatchFromPreferences(payload);
assert.equal(patch.bodyMeasurements.usualSize, "M");
assert.equal(patch.bodyMeasurements.shoeSizeEu, "42");
assert.equal(patch.primaryVehicle.year, 2018);

assert.equal(buyerMeasurementsFromProfile({}), null);
assert.ok(buyerMeasurementsFromProfile({ bodyMeasurements: { usualSize: "L" } }));
assert.equal(
  buyerMeasurementsFromProfile({ bodyMeasurements: {} }),
  null
);

console.log("✔ AI preference profile checks passed");
