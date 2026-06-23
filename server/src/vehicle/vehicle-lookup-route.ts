import {
  isLtPlate,
  lookupLtPlate,
  regitraPlateApiConfigured,
  type PlateLookupResult,
} from "./plate-lookup.js";
import { lookupVinNhtsa, type VinLookupResult } from "./vin-lookup.js";
import { isValidVin, normalizeVin } from "./vin-utils.js";

export type ServerVehicleLookupResult = (PlateLookupResult | VinLookupResult) & {
  identifier: string;
};

export function vehicleLookupFeatures(): {
  regitraPlateApi: boolean;
  nhtsaVin: boolean;
} {
  return {
    regitraPlateApi: regitraPlateApiConfigured(),
    nhtsaVin: true,
  };
}

export async function lookupVehicleOnServer(
  identifier?: string
): Promise<ServerVehicleLookupResult | null> {
  const raw = identifier?.trim() ?? "";
  if (!raw) return null;

  const normalized = raw.toUpperCase();
  if (isValidVin(normalized)) {
    const vin = await lookupVinNhtsa(normalized);
    if (vin) return { ...vin, identifier: normalizeVin(normalized) };
  }

  if (isLtPlate(normalized)) {
    const plate = await lookupLtPlate(raw);
    return { ...plate, identifier: plate.plateNumber };
  }

  return null;
}
