export interface PlateLookupResult {
  source: "regitra-plate-api" | "regitra-demo";
  confidence: number;
  plateNumber: string;
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

export function normalizeLtPlate(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (compact.length !== 6) return raw.trim().toUpperCase();
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export function isLtPlate(raw: string): boolean {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{3}\d{3}$/.test(compact);
}

function mapFuel(raw?: string): string {
  const v = (raw ?? "").toLowerCase();
  if (/dyzel|diesel/i.test(v)) return "Dyzelinas";
  if (/elektr/i.test(v)) return "Elektra";
  if (/hibrid|hybrid/i.test(v)) return "Hibridas";
  if (/benzin|petrol|gasoline/i.test(v)) return "Benzinas";
  return raw?.trim() || "Nežinoma";
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

const DEMO_PLATE: PlateLookupResult = {
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

    return {
      source: "regitra-plate-api",
      confidence: 0.92,
      plateNumber: normalized,
      vin: pickString(json, "VIN", "Vin", "vin") || undefined,
      make: split.make,
      model: split.model,
      year: year || "—",
      fuelType: mapFuel(pickString(json, "FuelType", "Fuel", "fuelType")),
      engine: pickString(json, "EngineSize", "Engine", "engine") || "Nežinomas",
      bodyType: pickString(json, "BodyType", "Body", "bodyType") || "Nežinomas",
      mileage: pickString(json, "Mileage", "mileage") || undefined,
      taExpiry: pickString(json, "MotExpiryDate", "MotExpiry", "taExpiry") || "—",
      taValid: Boolean(pickString(json, "MotExpiryDate", "MotExpiry")),
      registrationCountry: "LT",
    };
  } catch {
    return null;
  }
}

export function lookupLtPlateDemo(plate: string): PlateLookupResult {
  return {
    ...DEMO_PLATE,
    plateNumber: normalizeLtPlate(plate),
  };
}

export async function lookupLtPlate(plate: string): Promise<PlateLookupResult> {
  const viaApi = await lookupLtPlateViaApi(plate);
  if (viaApi) return viaApi;
  return lookupLtPlateDemo(plate);
}
