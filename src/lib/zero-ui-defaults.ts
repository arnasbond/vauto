/** Zero-UI default user profile anchors for agent memory. Empty = Visa Lietuva. */
export const DEFAULT_USER_REGION = "";

export const ALL_LITHUANIA_LABEL = "Visa Lietuva";

export interface PrimaryVehicle {
  make: string;
  model: string;
  year: number;
}

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

/**
 * F1.3 — category neutrality: a vehicle anchor exists ONLY when the user has
 * explicitly saved a real vehicle. No synthetic fleet default is invented for
 * users without one (previously every user received a fake "Volvo V70").
 */
export function resolvePrimaryVehicle(
  vehicle?: Partial<PrimaryVehicle> | null
): PrimaryVehicle | null {
  if (vehicle?.make?.trim() && vehicle?.model?.trim() && vehicle.year) {
    return {
      make: vehicle.make.trim(),
      model: vehicle.model.trim(),
      year: Number(vehicle.year),
    };
  }
  return null;
}

export function formatPrimaryVehicleLabel(vehicle: PrimaryVehicle): string {
  return `${vehicle.year} m. ${vehicle.make} ${vehicle.model}`;
}
