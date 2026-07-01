import {
  extractMileageRecords,
  isOfficialVehicleSource,
  mapBodyTypeLt,
  mapFuelType,
  mapGearbox,
  parsePowerHp,
  parsePowerKw,
  type MileageRecord,
} from "./vehicle-attribute-mappers.js";

export interface PlateLookupResult {
  source: "regitra-plate-api" | "regitra-demo";
  verified: boolean;
  confidence: number;
  plateNumber: string;
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

export function normalizeLtPlate(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (compact.length !== 6) return raw.trim().toUpperCase();
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export function isLtPlate(raw: string): boolean {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{3}\d{3}$/.test(compact);
}

function extractVehicleJson(xml: string): Record<string, unknown> | null {
  const jsonMatch = xml.match(/<vehicleJson[^>]*>([\s\S]*?)<\/vehicleJson>/i);
  if (!jsonMatch?.[1]) return null;
  const decoded = jsonMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function splitMakeModel(description: string, makeHint: string, modelHint: string): {
  make: string;
  model: string;
} {
  if (makeHint && modelHint) {
    return { make: makeHint, model: modelHint };
  }
  const parts = description.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { make: parts[0], model: parts.slice(1).join(" ") };
  }
  return { make: makeHint || description || "Nežinoma", model: modelHint || "Modelis" };
}

const DEMO_PLATE_CATALOG: Omit<
  PlateLookupResult,
  "source" | "confidence" | "plateNumber" | "verified"
>[] = [
  {
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
  },
  {
    vin: "JTDBT923503012345",
    make: "Toyota",
    model: "Corolla",
    year: "2019",
    fuelType: "Hibridas",
    gearbox: "Automatinė",
    engine: "1.8 Hybrid 90 kW",
    bodyType: "Sedanas",
    powerKw: "90",
    mileage: "92 000 km",
    mileageRecords: [{ date: "2025-01", km: "92000" }],
    taExpiry: "2026-11",
    taValid: true,
    registrationCountry: "LT",
  },
  {
    vin: "WBA3A51050F123456",
    make: "BMW",
    model: "320d",
    year: "2017",
    fuelType: "Dyzelinas",
    gearbox: "Automatinė",
    engine: "2.0 d 140 kW",
    bodyType: "Universalas",
    powerKw: "140",
    mileage: "143 000 km",
    mileageRecords: [{ date: "2024-09", km: "143000" }],
    taExpiry: "2027-01",
    taValid: true,
    registrationCountry: "LT",
  },
  {
    vin: "VF7SC8HR0AW123456",
    make: "Peugeot",
    model: "308",
    year: "2014",
    fuelType: "Benzinas",
    gearbox: "Mechaninė",
    engine: "1.6 VTi 88 kW",
    bodyType: "Hečbekas",
    powerKw: "88",
    mileage: "201 000 km",
    mileageRecords: [{ date: "2024-06", km: "201000" }],
    taExpiry: "2026-08",
    taValid: true,
    registrationCountry: "LT",
  },
  {
    vin: "KNACB81GFM5123456",
    make: "Kia",
    model: "Sportage",
    year: "2021",
    fuelType: "Dyzelinas",
    gearbox: "Automatinė",
    engine: "1.6 CRDi 100 kW",
    bodyType: "Visureigis / SUV",
    powerKw: "100",
    mileage: "58 000 km",
    mileageRecords: [{ date: "2025-02", km: "58000" }],
    taExpiry: "2028-04",
    taValid: true,
    registrationCountry: "LT",
  },
  {
    vin: "YV1DZ8256C2123456",
    make: "Volvo",
    model: "V60",
    year: "2018",
    fuelType: "Dyzelinas",
    gearbox: "Automatinė",
    engine: "D3 110 kW",
    bodyType: "Universalas",
    powerKw: "110",
    mileage: "119 000 km",
    mileageRecords: [{ date: "2024-12", km: "119000" }],
    taExpiry: "2027-09",
    taValid: true,
    registrationCountry: "LT",
  },
];

function hashPlate(plate: string): number {
  const compact = plate.replace(/\s+/g, "").toUpperCase();
  let hash = 0;
  for (const ch of compact) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function regitraPlateApiConfigured(): boolean {
  return Boolean(
    process.env.REGITRA_PLATE_API_USERNAME?.trim() &&
      process.env.REGITRA_PLATE_API_PASSWORD?.trim()
  );
}

export async function lookupLtPlateViaApi(
  plate: string
): Promise<PlateLookupResult | null> {
  const username = process.env.REGITRA_PLATE_API_USERNAME?.trim();
  const password = process.env.REGITRA_PLATE_API_PASSWORD?.trim();
  if (!username || !password) return null;

  const normalized = normalizeLtPlate(plate);
  const compact = normalized.replace(/\s+/g, "");
  const base =
    process.env.REGITRA_PLATE_API_URL?.trim() ||
    "https://www.numeriozenklaiapi.lt/api/reg.asmx";

  const url = new URL(`${base.replace(/\/$/, "")}/CheckLithuania`);
  url.searchParams.set("RegistrationNumber", compact);
  url.searchParams.set("username", username);
  url.searchParams.set("password", password);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const json = extractVehicleJson(xml);
    if (!json) return null;

    const description = pickString(json, "Description", "CarMake", "carMake");
    const make = pickString(json, "Make", "CarMake", "make");
    const model = pickString(json, "Model", "CarModel", "model");
    const split = splitMakeModel(description, make, model);
    const year =
      pickString(json, "RegistrationYear", "YearOfManufacture", "year") ||
      pickString(json, "ManufactureYearFrom");

    if (!split.make && !description) return null;

    const engine =
      pickString(json, "EngineSize", "Engine", "engine") || "Nežinomas";
    const mileageRecords = extractMileageRecords(json);
    const mileage =
      pickString(json, "Mileage", "mileage", "Odometer") || undefined;
    const source = "regitra-plate-api" as const;

    return {
      source,
      verified: isOfficialVehicleSource(source),
      confidence: 0.92,
      plateNumber: normalized,
      vin: pickString(json, "VIN", "Vin", "vin") || undefined,
      make: split.make,
      model: split.model,
      year: year || "—",
      fuelType: mapFuelType(pickString(json, "FuelType", "Fuel", "fuelType")),
      gearbox: mapGearbox(
        pickString(json, "Transmission", "Gearbox", "gearbox", "TransmissionType")
      ),
      engine,
      bodyType: mapBodyTypeLt(
        pickString(json, "BodyType", "Body", "bodyType")
      ),
      powerKw:
        parsePowerKw(pickString(json, "EngineKW", "PowerKW", "powerKw")) ??
        parsePowerKw(engine),
      powerHp: parsePowerHp(engine),
      mileage,
      mileageRecords,
      taExpiry: pickString(json, "MotExpiryDate", "MotExpiry", "taExpiry") || "—",
      taValid: Boolean(pickString(json, "MotExpiryDate", "MotExpiry")),
      registrationCountry: "LT",
    };
  } catch {
    return null;
  }
}

export function lookupLtPlateDemo(plate: string): PlateLookupResult {
  const pick = DEMO_PLATE_CATALOG[hashPlate(plate) % DEMO_PLATE_CATALOG.length];
  const source = "regitra-demo" as const;
  return {
    ...pick,
    source,
    verified: isOfficialVehicleSource(source),
    confidence: 0.84,
    plateNumber: normalizeLtPlate(plate),
  };
}

export async function lookupLtPlate(plate: string): Promise<PlateLookupResult> {
  const viaApi = await lookupLtPlateViaApi(plate);
  if (viaApi) return viaApi;
  return lookupLtPlateDemo(plate);
}
