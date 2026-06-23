import type { AiExtractedListing } from "@/lib/types";
import { isValidVin, normalizeVin } from "@/lib/trust";

export interface VehicleLookupResult {
  source: "regitra-demo" | "vin-decoder-demo" | "vin-decoder-nhtsa" | "vision-demo";
  confidence: number;
  plateNumber?: string;
  vin?: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  engine: string;
  bodyType: string;
  mileage?: string;
  taExpiry: string;
  taValid: boolean;
  registrationCountry: string;
}

const DEMO_VEHICLE: VehicleLookupResult = {
  source: "regitra-demo",
  confidence: 0.94,
  plateNumber: "KAA 123",
  vin: "WVWZZZ1KZAW123456",
  make: "Volkswagen",
  model: "Golf",
  year: "2015",
  fuelType: "Dyzelinas",
  engine: "1.6 TDI 77 kW",
  bodyType: "Hečbekas",
  mileage: "185 000 km",
  taExpiry: "2027-03",
  taValid: true,
  registrationCountry: "LT",
};

const CITROEN_DS5_DEMO: VehicleLookupResult = {
  source: "vin-decoder-demo",
  confidence: 0.91,
  make: "Citroën",
  model: "DS5",
  year: "2013",
  fuelType: "Dyzelinas",
  engine: "1.6 e-HDi 85 kW",
  bodyType: "Hečbekas",
  mileage: undefined,
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
  BodyClass?: string;
}

function mapFuel(raw?: string): string {
  const v = (raw ?? "").toLowerCase();
  if (/diesel/i.test(v)) return "Dyzelinas";
  if (/electric/i.test(v)) return "Elektra";
  if (/hybrid/i.test(v)) return "Hibridas";
  if (/gasoline|petrol/i.test(v)) return "Benzinas";
  return raw?.trim() || "Nežinoma";
}

function engineLabel(row: NhtsaVinRow): string {
  const parts: string[] = [];
  if (row.DisplacementL) parts.push(`${row.DisplacementL} L`);
  if (row.EngineHP) parts.push(`${row.EngineHP} AG`);
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

    return {
      source: "vin-decoder-nhtsa",
      confidence: 0.88,
      vin: normalized,
      make: row.Make.trim(),
      model: (row.Model ?? "").trim() || "Modelis",
      year: String(row.ModelYear ?? "").trim() || "—",
      fuelType: mapFuel(row.FuelTypePrimary),
      engine: engineLabel(row),
      bodyType: (row.BodyClass ?? "Nežinomas").trim(),
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

  const citroenDs5 =
    makeHint.includes("citro") && modelHint.includes("ds5");

  if (isValidVin(normalized)) {
    const base = citroenDs5 ? CITROEN_DS5_DEMO : DEMO_VEHICLE;
    return {
      ...base,
      source: "vin-decoder-demo",
      vin: normalizeVin(normalized),
    };
  }
  if (/^[A-Z]{3}\s?\d{3}$/.test(normalized)) {
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
      : "Regitra/VIN demo adapterio";

  return {
    title: `${result.make} ${result.model} ${result.year}`,
    category: "vehicles",
    confidence: result.confidence,
    attributes: {
      vin: result.vin,
      plateNumber: result.plateNumber,
      make: result.make,
      model: result.model,
      year: result.year,
      fuelType: result.fuelType,
      engine: result.engine,
      bodyType: result.bodyType,
      mileage: result.mileage,
      taExpiry: result.taExpiry,
      taStatus: result.taValid ? "TA galioja" : "TA nežinoma",
      vehicleDataSource: result.source,
    },
    description: `${result.make} ${result.model}, ${result.year} m., ${result.fuelType}, ${result.engine}. Duomenys iš ${sourceLabel}.`,
  };
}
