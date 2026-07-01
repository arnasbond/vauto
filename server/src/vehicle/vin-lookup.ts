import {
  isOfficialVehicleSource,
  mapBodyTypeLt,
  mapFuelType,
  mapGearbox,
  parsePowerHp,
  parsePowerKw,
  type MileageRecord,
} from "./vehicle-attribute-mappers.js";
import { isValidVin, normalizeVin } from "./vin-utils.js";

export interface VinLookupResult {
  source: "vin-decoder-nhtsa";
  verified: boolean;
  confidence: number;
  vin: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  gearbox?: string;
  engine: string;
  bodyType: string;
  powerKw?: string;
  powerHp?: string;
  mileage?: string;
  mileageRecords: MileageRecord[];
  taExpiry: string;
  taValid: boolean;
  registrationCountry: string;
}

interface NhtsaVinRow {
  ErrorCode?: string;
  Make?: string;
  Model?: string;
  ModelYear?: string;
  FuelTypePrimary?: string;
  DisplacementL?: string;
  EngineHP?: string;
  EngineKW?: string;
  BodyClass?: string;
  TransmissionStyle?: string;
}

function engineLabel(row: NhtsaVinRow): string {
  const parts: string[] = [];
  if (row.DisplacementL) parts.push(`${row.DisplacementL} L`);
  const kw = parsePowerKw(row.EngineKW);
  const hp = parsePowerHp(row.EngineHP);
  if (kw) parts.push(`${kw} kW`);
  else if (hp) parts.push(`${hp} AG`);
  return parts.join(" ") || "Nežinomas";
}

export async function lookupVinNhtsa(vin: string): Promise<VinLookupResult | null> {
  const normalized = normalizeVin(vin);
  if (!isValidVin(normalized)) return null;

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(normalized)}?format=json`,
      { signal: AbortSignal.timeout(12_000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Results?: NhtsaVinRow[] };
    const row = json.Results?.[0];
    if (!row || row.ErrorCode !== "0" || !row.Make) return null;

    const source = "vin-decoder-nhtsa" as const;
    const powerKw = parsePowerKw(row.EngineKW);
    const powerHp = parsePowerHp(row.EngineHP);

    return {
      source,
      verified: isOfficialVehicleSource(source),
      confidence: 0.88,
      vin: normalized,
      make: row.Make.trim(),
      model: (row.Model ?? "").trim() || "Modelis",
      year: String(row.ModelYear ?? "").trim() || "—",
      fuelType: mapFuelType(row.FuelTypePrimary),
      gearbox: mapGearbox(row.TransmissionStyle),
      engine: engineLabel(row),
      bodyType: mapBodyTypeLt(row.BodyClass),
      powerKw,
      powerHp,
      mileage: undefined,
      mileageRecords: [],
      taExpiry: "—",
      taValid: false,
      registrationCountry: "—",
    };
  } catch {
    return null;
  }
}
