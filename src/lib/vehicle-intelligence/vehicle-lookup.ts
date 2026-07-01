import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";
import { isPlausibleVin, isValidVinForLookup, normalizeVin } from "@/lib/trust";
import {
  isLtPlate,
  isOfficialVehicleSource,
  isOpenDataVehicleSource,
  mapBodyTypeLt,
  mapFuelType,
  mapGearbox,
  parsePowerHp,
  parsePowerKw,
  type MileageRecord,
} from "./vehicle-attribute-mappers";
import { lookupEuVinClient } from "./vin-eu";

export type { MileageRecord };

export interface VehicleLookupResult {
  source:
    | "regitra-plate-api"
    | "lt-transeksta-opendata"
    | "lt-regitra-opendata"
    | "lt-opendata-partial"
    | "vin-decoder-nhtsa"
    | "eu-vin-opendata"
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
  if (!isPlausibleVin(normalized)) return null;

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

async function lookupVehicleByVinEuOpen(vin: string): Promise<VehicleLookupResult | null> {
  const normalized = normalizeVin(vin);
  if (!isValidVinForLookup(normalized)) return null;
  const eu = await lookupEuVinClient(normalized);
  if (!eu) return null;
  const source = "eu-vin-opendata" as const;
  return {
    source,
    verified: false,
    confidence: 0.76,
    vin: normalized,
    make: eu.make,
    model: eu.model,
    year: eu.year,
    fuelType: "Nežinoma",
    engine: "Nežinomas",
    bodyType: "Nežinomas",
    mileageRecords: [],
    taExpiry: "—",
    taValid: false,
    registrationCountry: eu.country,
  };
}

export function vehicleLookupFallback(identifier: string): VehicleLookupResult {
  return partialShell(identifier);
}

function partialShell(identifier: string): VehicleLookupResult {
  const normalized = identifier.trim().toUpperCase();
  const plate = isLtPlate(normalized);
  return {
    source: plate ? "lt-opendata-partial" : "eu-vin-opendata",
    verified: false,
    confidence: 0.25,
    plateNumber: plate ? normalized.replace(/(\d{3})$/, " $1") : undefined,
    vin: plate ? undefined : normalizeVin(normalized),
    make: "Nežinoma",
    model: "Modelis",
    year: "—",
    fuelType: "Nežinoma",
    engine: "Nežinomas",
    bodyType: "Nežinomas",
    mileageRecords: [],
    taExpiry: "—",
    taValid: false,
    registrationCountry: plate ? "LT" : "—",
  };
}

export async function lookupVehicle(
  identifier?: string,
  hint?: { make?: string; model?: string; vin?: string; plate?: string }
): Promise<VehicleLookupResult> {
  const normalized = identifier?.trim().toUpperCase() ?? "";

  const { isDataApiEnabled } = await import("@/lib/api/config");
  if (isDataApiEnabled() && normalized) {
    const { apiLookupVehicle } = await import("@/lib/api/client");
    const remote = await apiLookupVehicle(normalized, {
      vin: hint?.vin,
      plate: hint?.plate,
    });
    if (remote) {
      return {
        ...remote,
        verified: remote.verified ?? isOfficialVehicleSource(remote.source),
        mileageRecords: remote.mileageRecords ?? [],
      };
    }
  }

  if (isValidVinForLookup(normalized)) {
    const nhtsa = await lookupVehicleByVinNhtsa(normalized);
    if (nhtsa) return nhtsa;
    const eu = await lookupVehicleByVinEuOpen(normalized);
    if (eu) return eu;
  }

  if (isLtPlate(normalized) && hint?.vin && isValidVinForLookup(hint.vin)) {
    const eu = await lookupVehicleByVinEuOpen(hint.vin);
    if (eu) {
      return {
        ...eu,
        plateNumber: normalized.replace(/(\d{3})$/, " $1"),
        source: "lt-opendata-partial",
        confidence: 0.72,
        registrationCountry: "LT",
      };
    }
  }

  return partialShell(normalized || "—");
}

export function vehicleLookupToDraftPatch(
  result: VehicleLookupResult
): Partial<AiExtractedListing> {
  const sourceLabel =
    result.source === "vin-decoder-nhtsa"
      ? "NHTSA VIN dekoderio"
      : result.source === "regitra-plate-api"
        ? "LT numerio API (Regitra duomenys)"
        : result.source === "eu-vin-opendata"
          ? "ES atviro VIN dekoderio (WMI)"
          : isOpenDataVehicleSource(result.source)
            ? "LT atvirų TA duomenų šaltinio"
            : "transporto duomenų šaltinio";

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
