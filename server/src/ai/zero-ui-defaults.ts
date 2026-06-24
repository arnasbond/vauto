import { resolveLtCityNominative } from "./lithuanian-location-normalize.js";

/** Empty string = search/list nationwide (Visa Lietuva). */
export const DEFAULT_USER_REGION = "";

export const ALL_LITHUANIA_LABEL = "Visa Lietuva";

export interface PrimaryVehicle {
  make: string;
  model: string;
  year: number;
}

export const DEFAULT_PRIMARY_VEHICLE: PrimaryVehicle = {
  make: "Volvo",
  model: "V70",
  year: 2006,
};

export function resolveAgentDefaultCity(input?: string | null): string {
  const trimmed = String(input ?? "").trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "lietuva" ||
    trimmed.toLowerCase() === "miestas" ||
    trimmed.toLowerCase() === "visa lietuva"
  ) {
    return "";
  }
  return resolveLtCityNominative(trimmed);
}

export function formatPrimaryVehicleLabel(vehicle: PrimaryVehicle): string {
  return `${vehicle.year} m. ${vehicle.make} ${vehicle.model}`;
}
