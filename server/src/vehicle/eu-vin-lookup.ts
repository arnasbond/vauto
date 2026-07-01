import { logProductionWarn } from "../lib/production-log.js";
import {
  mapBodyTypeLt,
  mapFuelType,
  mapGearbox,
  parsePowerHp,
  parsePowerKw,
  type MileageRecord,
} from "./vehicle-attribute-mappers.js";
import {
  decodeVinModelYear,
  decodeWmiLocal,
  guessEuModelFromVin,
} from "./wmi-eu.js";
import { normalizeVin } from "./vin-utils.js";
import type { VinLookupResult } from "./vehicle-lookup-types.js";

interface NhtsaFlatRow {
  Variable?: string;
  Value?: string;
}

interface NhtsaWmiRow {
  Manufacturer?: string;
  Country?: string;
  VehicleType?: string;
}

function pickFlatValue(rows: NhtsaFlatRow[], variable: string): string {
  const hit = rows.find((r) => r.Variable === variable);
  const v = hit?.Value?.trim();
  if (!v || v === "Not Applicable" || v === "Not Provided") return "";
  return v;
}

async function fetchNhtsaDecodeVinFlat(vin: string): Promise<NhtsaFlatRow[]> {
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(vin)}?format=json`,
    { signal: AbortSignal.timeout(12_000) }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { Results?: NhtsaFlatRow[] };
  return json.Results ?? [];
}

async function fetchNhtsaDecodeWmi(wmi: string): Promise<NhtsaWmiRow | null> {
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeWMI/${encodeURIComponent(wmi)}?format=json`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { Results?: NhtsaWmiRow[] };
  return json.Results?.[0] ?? null;
}

/**
 * Open EU VIN decode — WMI table + NHTSA WMI + flat DecodeVin + local year/model heuristics.
 * Used when NHTSA ValuesExtended returns error 1+7 for European VINs.
 */
export async function lookupEuVinOpenData(vin: string): Promise<VinLookupResult | null> {
  const normalized = normalizeVin(vin);
  const wmiLocal = decodeWmiLocal(normalized);
  if (!wmiLocal) return null;

  let make = wmiLocal.make;
  let model = guessEuModelFromVin(normalized, make) ?? "Modelis";
  let year = decodeVinModelYear(normalized) ?? "—";
  let fuelType = "Nežinoma";
  let bodyType = "Nežinomas";
  let engine = "Nežinomas";
  let gearbox: string | undefined;
  let powerKw: string | undefined;
  let powerHp: string | undefined;

  try {
    const wmiRemote = await fetchNhtsaDecodeWmi(wmiLocal.wmi);
    if (wmiRemote?.Manufacturer?.trim()) {
      make = wmiRemote.Manufacturer.trim();
    }
  } catch (e) {
    logProductionWarn("eu-vin-lookup", "NHTSA DecodeWMI failed", {
      wmi: wmiLocal.wmi,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const flat = await fetchNhtsaDecodeVinFlat(normalized);
    if (flat.length) {
      const remoteMake = pickFlatValue(flat, "Make");
      const remoteModel = pickFlatValue(flat, "Model");
      const remoteYear = pickFlatValue(flat, "Model Year");
      if (remoteMake) make = remoteMake;
      if (remoteModel) model = remoteModel;
      if (remoteYear) year = remoteYear;
      fuelType = mapFuelType(pickFlatValue(flat, "Fuel Type - Primary"));
      bodyType = mapBodyTypeLt(pickFlatValue(flat, "Body Class"));
      gearbox = mapGearbox(pickFlatValue(flat, "Transmission Style"));
      const disp = pickFlatValue(flat, "Displacement (L)");
      const kw = parsePowerKw(pickFlatValue(flat, "Engine kW"));
      const hp = parsePowerHp(pickFlatValue(flat, "Engine HP"));
      powerKw = kw;
      powerHp = hp;
      engine = [disp ? `${disp} L` : "", kw ? `${kw} kW` : "", hp ? `${hp} AG` : ""]
        .filter(Boolean)
        .join(" ") || engine;
    }
  } catch (e) {
    logProductionWarn("eu-vin-lookup", "NHTSA DecodeVin flat failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (make === "Unknown" || make === "Stellantis (EU)") {
    return null;
  }

  return {
    source: "eu-vin-opendata",
    verified: false,
    confidence: 0.78,
    vin: normalized,
    make,
    model,
    year,
    fuelType,
    gearbox,
    engine,
    bodyType,
    powerKw,
    powerHp,
    mileage: undefined,
    mileageRecords: [],
    taExpiry: "—",
    taValid: false,
    registrationCountry: wmiLocal.country,
  };
}

export function mergeVinWithLtTaData(
  vinResult: VinLookupResult,
  ta: { taExpiry?: string; taValid?: boolean; mileage?: string; mileageRecords?: MileageRecord[] }
): VinLookupResult {
  return {
    ...vinResult,
    mileage: ta.mileage ?? vinResult.mileage,
    mileageRecords: ta.mileageRecords?.length ? ta.mileageRecords : vinResult.mileageRecords,
    taExpiry: ta.taExpiry ?? vinResult.taExpiry,
    taValid: ta.taValid ?? vinResult.taValid,
    registrationCountry: vinResult.registrationCountry === "—" ? "LT" : vinResult.registrationCountry,
  };
}
