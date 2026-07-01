import { mergeVinWithLtTaData } from "./eu-vin-lookup.js";
import { lookupLtOpenData } from "./lt-ta-open-data.js";
import {
  isLtPlate,
  lookupLtPlate,
  regitraPlateApiConfigured,
  type PlateLookupResult,
} from "./plate-lookup.js";
import { lookupVin, type VinLookupResult } from "./vin-lookup.js";
import { isValidVinForLookup, normalizeVin } from "./vin-utils.js";

export type ServerVehicleLookupResult = (PlateLookupResult | VinLookupResult) & {
  identifier: string;
};

export function vehicleLookupFeatures(): {
  regitraPlateApi: boolean;
  ltOpenData: boolean;
  euVinOpenData: boolean;
  nhtsaVin: boolean;
} {
  return {
    regitraPlateApi: regitraPlateApiConfigured(),
    ltOpenData: true,
    euVinOpenData: true,
    nhtsaVin: true,
  };
}

export interface VehicleLookupHints {
  vin?: string;
  plate?: string;
}

export async function lookupVehicleOnServer(
  identifier?: string,
  hints?: VehicleLookupHints
): Promise<ServerVehicleLookupResult | null> {
  const raw = identifier?.trim() ?? "";
  if (!raw) return null;

  const normalized = raw.toUpperCase();
  const vinHint = hints?.vin?.trim() || (isValidVinForLookup(normalized) ? raw : undefined);
  const plateHint =
    hints?.plate?.trim() ||
    (isLtPlate(normalized) ? raw : undefined);

  if (isValidVinForLookup(normalized)) {
    let vin = await lookupVin(normalized);
    if (vin) {
      const taPlate = plateHint ?? "";
      const ta = await lookupLtOpenData(taPlate || "LT", normalizeVin(normalized));
      if (ta) vin = mergeVinWithLtTaData(vin, ta);
      return { ...vin, identifier: normalizeVin(normalized) };
    }
  }

  if (isLtPlate(normalized)) {
    const plate = await lookupLtPlate(raw, { vin: vinHint });
    return { ...plate, identifier: plate.plateNumber };
  }

  return null;
}
