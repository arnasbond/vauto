/** Zero-UI default user profile anchors for agent memory. Empty = Visa Lietuva. */
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

export function resolveDefaultUserCity(city?: string | null): string {
  const trimmed = city?.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "lietuva" ||
    trimmed.toLowerCase() === "miestas" ||
    trimmed.toLowerCase() === "visa lietuva"
  ) {
    return "";
  }
  return trimmed;
}

export function resolvePrimaryVehicle(
  vehicle?: Partial<PrimaryVehicle> | null
): PrimaryVehicle {
  if (vehicle?.make?.trim() && vehicle?.model?.trim() && vehicle.year) {
    return {
      make: vehicle.make.trim(),
      model: vehicle.model.trim(),
      year: Number(vehicle.year),
    };
  }
  return DEFAULT_PRIMARY_VEHICLE;
}

export function formatPrimaryVehicleLabel(vehicle: PrimaryVehicle): string {
  return `${vehicle.year} m. ${vehicle.make} ${vehicle.model}`;
}
