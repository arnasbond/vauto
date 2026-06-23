import { isValidVin, normalizeVin } from "./vin-utils.js";

export interface VinLookupResult {
  source: "vin-decoder-nhtsa";
  confidence: number;
  vin: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  engine: string;
  bodyType: string;
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
