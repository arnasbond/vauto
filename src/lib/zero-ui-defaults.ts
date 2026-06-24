/** Zero-UI demo / default user profile anchors for agent memory. */
export const DEFAULT_USER_REGION = "Panevėžys";

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
  if (!trimmed || trimmed.toLowerCase() === "lietuva" || trimmed.toLowerCase() === "miestas") {
    return DEFAULT_USER_REGION;
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
