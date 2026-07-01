import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";
import { isValidVin, normalizeVin } from "@/lib/trust";
import {
  isLtPlate,
  isOfficialVehicleSource,
  mapBodyTypeLt,
  mapFuelType,
  mapGearbox,
  parsePowerHp,
  parsePowerKw,
  type MileageRecord,
} from "./vehicle-attribute-mappers";

export type { MileageRecord };

export interface VehicleLookupResult {
  source:
    | "regitra-demo"
    | "regitra-plate-api"
    | "vin-decoder-demo"
    | "vin-decoder-nhtsa"
    | "vision-demo";
  verified: boolean;
  confidence: number;
  plateNumber?: string;
  vin?: string;
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

const DEMO_VEHICLE: VehicleLookupResult = {
  source: "regitra-demo",
  verified: false,
  confidence: 0.94,
  plateNumber: "KAA 123",
  vin: "WVWZZZ1KZAW123456",
  make: "Volkswagen",
  model: "Golf",
  year: "2015",
  fuelType: "Dyzelinas",
  gearbox: "Mechaninė",
  engine: "1.6 TDI 77 kW",
  bodyType: "Hečbekas",
  powerKw: "77",
  mileage: "185 000 km",
  mileageRecords: [{ date: "2024-11", km: "185000" }],
  taExpiry: "2027-03",
  taValid: true,
  registrationCountry: "LT",
};

const CITROEN_DS5_DEMO: VehicleLookupResult = {
  source: "vin-decoder-demo",
  verified: false,
  confidence: 0.91,
  make: "Citroën",
  model: "DS5",
  year: "2013",
  fuelType: "Dyzelinas",
  gearbox: "Automatinė",
  engine: "1.6 e-HDi 85 kW",
  bodyType: "Hečbekas",
  powerKw: "85",
  mileage: undefined,
  mileageRecords: [],
  taExpiry: "2027-06",
  taValid: true,
  registrationCountry: "LT",
};

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

export async function lookupVehicleByVinNhtsa(vin: string): Promise<VehicleLookupResult | null> {
  const normalized = normalizeVin(vin);
  if (!isValidVin(normalized)) return null;

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(normalized)}?format=json`
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Results?: NhtsaVinRow[] };
    const row = json.Results?.[0];
    if (!row || row.ErrorCode !== "0" || !row.Make) return null;

    const source = "vin-decoder-nhtsa" as const;
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
      powerKw: parsePowerKw(row.EngineKW),
      powerHp: parsePowerHp(row.EngineHP),
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

export function lookupVehicleDemo(
  identifier?: string,
  hint?: { make?: string; model?: string }
): VehicleLookupResult {
  const normalized = identifier?.trim().toUpperCase() ?? "";
  const makeHint = hint?.make?.toLowerCase() ?? "";
  const modelHint = hint?.model?.toLowerCase() ?? "";

  const citroenDs5 = makeHint.includes("citro") && modelHint.includes("ds5");

  if (isValidVin(normalized)) {
    const base = citroenDs5 ? CITROEN_DS5_DEMO : DEMO_VEHICLE;
    return {
      ...base,
      source: "vin-decoder-demo",
      verified: false,
      vin: normalizeVin(normalized),
    };
  }
  if (isLtPlate(normalized)) {
    const base = citroenDs5 ? CITROEN_DS5_DEMO : DEMO_VEHICLE;
    return {
      ...base,
      plateNumber: normalized.replace(/\s?(\d{3})$/, " $1"),
    };
  }
  if (citroenDs5) return CITROEN_DS5_DEMO;
  return DEMO_VEHICLE;
}

export async function lookupVehicle(
  identifier?: string,
  hint?: { make?: string; model?: string }
): Promise<VehicleLookupResult> {
  const normalized = identifier?.trim().toUpperCase() ?? "";

  const { isDataApiEnabled } = await import("@/lib/api/config");
  if (isDataApiEnabled() && normalized) {
    const { apiLookupVehicle } = await import("@/lib/api/client");
    const remote = await apiLookupVehicle(normalized);
    if (remote) {
      return {
        ...remote,
        verified: remote.verified ?? isOfficialVehicleSource(remote.source),
        mileageRecords: remote.mileageRecords ?? [],
      };
    }
  }

  if (isValidVin(normalized)) {
    const nhtsa = await lookupVehicleByVinNhtsa(normalized);
    if (nhtsa) return nhtsa;
  }
  return lookupVehicleDemo(identifier, hint);
}

export function vehicleLookupToDraftPatch(
  result: VehicleLookupResult
): Partial<AiExtractedListing> {
  const sourceLabel =
    result.source === "vin-decoder-nhtsa"
      ? "NHTSA VIN dekoderio"
      : result.source === "regitra-plate-api"
        ? "LT numerio API (Regitra duomenys)"
        : "Regitra/VIN demo adapterio";

  const attrs: CategoryAttributes = {
    vin: result.vin,
    plateNumber: result.plateNumber,
    make: result.make,
    model: result.model,
    year: result.year,
    fuelType: result.fuelType,
    engine: result.engine,
    bodyType: result.bodyType,
    taExpiry: result.taExpiry,
    taStatus: result.taValid ? "TA galioja" : "TA nežinoma",
    vehicleDataSource: result.source,
  };

  if (result.gearbox) attrs.gearbox = result.gearbox;
  if (result.powerKw) attrs.powerKw = result.powerKw;
  if (result.powerHp) attrs.powerHp = result.powerHp;
  if (result.mileage) attrs.mileage = result.mileage;

  return {
    title: `${result.make} ${result.model} ${result.year}`,
    category: "vehicles",
    confidence: result.confidence,
    isVinVerified: result.verified === true,
    attributes: attrs,
    description: `${result.make} ${result.model}, ${result.year} m., ${result.fuelType}${result.gearbox ? `, ${result.gearbox}` : ""}. Duomenys iš ${sourceLabel}.`,
  };
}
