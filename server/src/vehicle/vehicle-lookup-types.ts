import type { MileageRecord } from "./vehicle-attribute-mappers.js";

export type VinLookupSource = "vin-decoder-nhtsa" | "eu-vin-opendata";

export interface VinLookupResult {
  source: VinLookupSource;
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

export type PlateLookupSource =
  | "regitra-plate-api"
  | "lt-transeksta-opendata"
  | "lt-regitra-opendata"
  | "lt-opendata-partial";

export interface PlateLookupResult {
  source: PlateLookupSource;
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
