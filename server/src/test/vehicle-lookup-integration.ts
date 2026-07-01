/**
 * Internal integration test — plate NOG675 + VIN VF7KFRHC8CS517606 (Citroën DS5).
 * Run: npx tsx src/test/vehicle-lookup-integration.ts
 */
import "dotenv/config";
import { lookupEuVinOpenData } from "../vehicle/eu-vin-lookup.js";
import {
  lookupLtPlate,
  lookupLtPlateViaApi,
  regitraPlateApiConfigured,
} from "../vehicle/plate-lookup.js";
import { lookupVin, lookupVinNhtsa } from "../vehicle/vin-lookup.js";
import {
  lookupVehicleOnServer,
  vehicleLookupFeatures,
} from "../vehicle/vehicle-lookup-route.js";
import {
  isPlausibleVin,
  isValidVin,
  isValidVinForLookup,
  normalizeVin,
} from "../vehicle/vin-utils.js";

const PLATE = "NOG675";
const VIN = "VF7KFRHC8CS517606";

function section(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function printJson(label: string, data: unknown) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(data, null, 2));
}

async function fetchRawNhtsa(vin: string) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const json = (await res.json()) as { Results?: Record<string, string>[] };
  const row = json.Results?.[0];
  if (!row) return { error: "empty Results" };
  const keys = [
    "ErrorCode",
    "ErrorText",
    "Make",
    "Model",
    "ModelYear",
    "FuelTypePrimary",
    "DisplacementL",
    "EngineHP",
    "EngineKW",
    "BodyClass",
    "TransmissionStyle",
    "VehicleType",
    "PlantCountry",
    "Series",
    "Trim",
  ];
  const picked: Record<string, string> = {};
  for (const k of keys) {
    if (row[k]) picked[k] = row[k];
  }
  return picked;
}

function summarizeGaps(
  result: Record<string, unknown>,
  required: string[]
): string[] {
  const missing: string[] = [];
  for (const key of required) {
    const v = result[key];
    if (v == null || v === "" || v === "—" || v === "Nežinomas") {
      missing.push(key);
    }
  }
  return missing;
}

async function main() {
  section("VAUTO vehicle lookup — internal integration test (v1.6.21 open data)");
  console.log(`Plate: ${PLATE}  |  VIN: ${VIN}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  printJson("vehicleLookupFeatures()", vehicleLookupFeatures());
  console.log(`regitraPlateApiConfigured: ${regitraPlateApiConfigured()}`);
  console.log(
    `VIN checks — plausible: ${isPlausibleVin(VIN)}, lookup gate: ${isValidVinForLookup(VIN)}, isValidVin(EU relaxed): ${isValidVin(VIN)}, normalized: ${normalizeVin(VIN)}`
  );

  section("1) Plate lookup — lookupLtPlate (API → LT open data)");
  const plateResult = await lookupLtPlate(PLATE, { vin: VIN });
  printJson("lookupLtPlate(plate, { vin })", plateResult);
  const plateMissing = summarizeGaps(plateResult as unknown as Record<string, unknown>, [
    "make",
    "model",
    "year",
    "fuelType",
    "engine",
    "bodyType",
    "taExpiry",
    "mileage",
    "vin",
  ]);
  console.log(`Missing/empty plate fields: ${plateMissing.length ? plateMissing.join(", ") : "(none)"}`);

  section("2) Plate lookup — direct API only (lookupLtPlateViaApi)");
  const plateApiOnly = await lookupLtPlateViaApi(PLATE);
  if (plateApiOnly) {
    printJson("lookupLtPlateViaApi result", plateApiOnly);
  } else {
    console.log(
      "\nlookupLtPlateViaApi returned null — no REGITRA credentials, API error, or plate not in registry."
    );
  }

  section("3) VIN lookup — lookupVinNhtsa (NHTSA vPIC extended)");
  const vinNhtsa = await lookupVinNhtsa(VIN);
  printJson("lookupVinNhtsa result", vinNhtsa);
  if (!vinNhtsa) console.log("lookupVinNhtsa returned null (expected for EU VIN error 1+7)");

  section("4) VIN lookup — lookupEuVinOpenData (EU WMI open decode)");
  const vinEu = await lookupEuVinOpenData(VIN);
  printJson("lookupEuVinOpenData result", vinEu);

  section("5) VIN lookup — lookupVin (NHTSA → EU chain)");
  const vinChain = await lookupVin(VIN);
  printJson("lookupVin result", vinChain);

  section("6) Raw NHTSA API response (selected fields)");
  const rawNhtsa = await fetchRawNhtsa(VIN);
  printJson("NHTSA DecodeVinValuesExtended", rawNhtsa);

  section("7) Unified server route — lookupVehicleOnServer");
  const byPlate = await lookupVehicleOnServer(PLATE, { vin: VIN });
  const byVin = await lookupVehicleOnServer(VIN, { plate: PLATE });
  printJson("lookupVehicleOnServer(plate, { vin })", byPlate);
  printJson("lookupVehicleOnServer(vin, { plate })", byVin);

  section("SUMMARY");
  console.log(`Plate chain source: ${plateResult.source}`);
  console.log(`VIN chain source: ${vinChain?.source ?? "null"}`);
  if (plateResult.make && plateResult.make !== "Nežinoma") {
    console.log(`Plate path make/model: ${plateResult.make} ${plateResult.model} (${plateResult.year})`);
  }
  if (vinChain?.make) {
    console.log(`VIN path make/model: ${vinChain.make} ${vinChain.model} (${vinChain.year})`);
  }
  const demoGone = plateResult.make !== "Volkswagen";
  console.log(`Demo Golf removed: ${demoGone ? "YES" : "NO — still falling back to fiction"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
