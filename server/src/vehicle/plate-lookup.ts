import {
  extractMileageRecords,
  isOfficialVehicleSource,
  mapBodyTypeLt,
  mapFuelType,
  mapGearbox,
  parsePowerHp,
  parsePowerKw,
} from "./vehicle-attribute-mappers.js";
import { lookupLtOpenData, type LtTaOpenData } from "./lt-ta-open-data.js";
import { lookupVin } from "./vin-lookup.js";
import type { PlateLookupResult } from "./vehicle-lookup-types.js";

export type { PlateLookupResult } from "./vehicle-lookup-types.js";

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

function plateFromOpenData(
  plate: string,
  open: LtTaOpenData,
  vinDecode?: Awaited<ReturnType<typeof lookupVin>>
): PlateLookupResult {
  const source =
    open.source === "lt-regitra-opendata"
      ? ("lt-regitra-opendata" as const)
      : ("lt-transeksta-opendata" as const);

  return {
    source,
    verified: isOfficialVehicleSource(source),
    confidence: vinDecode ? 0.82 : 0.68,
    plateNumber: normalizeLtPlate(plate),
    vin: open.vin ?? vinDecode?.vin,
    make: vinDecode?.make ?? open.make ?? "Nežinoma",
    model: vinDecode?.model ?? open.model ?? "Modelis",
    year: vinDecode?.year ?? open.year ?? "—",
    fuelType: vinDecode?.fuelType ?? "Nežinoma",
    gearbox: vinDecode?.gearbox,
    engine: vinDecode?.engine ?? "Nežinomas",
    bodyType: vinDecode?.bodyType ?? "Nežinomas",
    powerKw: vinDecode?.powerKw,
    powerHp: vinDecode?.powerHp,
    mileage: open.mileage,
    mileageRecords: open.mileageRecords,
    taExpiry: open.taExpiry ?? "—",
    taValid: open.taValid ?? false,
    registrationCountry: "LT",
  };
}

function platePartialShell(plate: string, vinHint?: string): PlateLookupResult {
  return {
    source: "lt-opendata-partial",
    verified: false,
    confidence: 0.28,
    plateNumber: normalizeLtPlate(plate),
    vin: vinHint,
    make: "Nežinoma",
    model: "Modelis",
    year: "—",
    fuelType: "Nežinoma",
    engine: "Nežinomas",
    bodyType: "Nežinomas",
    mileageRecords: [],
    taExpiry: "—",
    taValid: false,
    registrationCountry: "LT",
  };
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

export async function lookupLtPlate(
  plate: string,
  opts?: { vin?: string }
): Promise<PlateLookupResult> {
  const viaApi = await lookupLtPlateViaApi(plate);
  if (viaApi) return viaApi;

  const vinHint = opts?.vin?.trim();
  const open = await lookupLtOpenData(plate, vinHint);
  if (open) {
    const vinDecode = vinHint ? await lookupVin(vinHint) : null;
    return plateFromOpenData(plate, open, vinDecode ?? undefined);
  }

  if (vinHint) {
    const vinDecode = await lookupVin(vinHint);
    if (vinDecode) {
      return {
        ...platePartialShell(plate, vinDecode.vin),
        source: "lt-opendata-partial",
        confidence: 0.72,
        make: vinDecode.make,
        model: vinDecode.model,
        year: vinDecode.year,
        fuelType: vinDecode.fuelType,
        gearbox: vinDecode.gearbox,
        engine: vinDecode.engine,
        bodyType: vinDecode.bodyType,
        powerKw: vinDecode.powerKw,
        powerHp: vinDecode.powerHp,
        registrationCountry: vinDecode.registrationCountry === "—" ? "LT" : vinDecode.registrationCountry,
      };
    }
  }

  return platePartialShell(plate, vinHint);
}
