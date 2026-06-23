import type { AiExtractedListing } from "@/lib/types";
import { isValidVin, normalizeVin } from "@/lib/trust";

export interface VehicleLookupResult {
  source: "regitra-demo" | "vin-decoder-demo" | "vision-demo";
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

export function lookupVehicleDemo(identifier?: string): VehicleLookupResult {
  const normalized = identifier?.trim().toUpperCase() ?? "";
  if (isValidVin(normalized)) {
    return {
      ...DEMO_VEHICLE,
      source: "vin-decoder-demo",
      vin: normalizeVin(normalized),
    };
  }
  if (/^[A-Z]{3}\s?\d{3}$/.test(normalized)) {
    return {
      ...DEMO_VEHICLE,
      plateNumber: normalized.replace(/\s?(\d{3})$/, " $1"),
    };
  }
  return DEMO_VEHICLE;
}

export function vehicleLookupToDraftPatch(
  result: VehicleLookupResult
): Partial<AiExtractedListing> {
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
      taStatus: result.taValid ? "TA galioja" : "TA negalioja",
      vehicleDataSource: result.source,
    },
    description: `${result.make} ${result.model}, ${result.year} m., ${result.fuelType}, ${result.engine}. TA galioja iki ${result.taExpiry}. Duomenys užpildyti iš Regitra/VIN demo adapterio.`,
  };
}
