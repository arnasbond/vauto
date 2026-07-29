/** LT vehicle catalog for step-by-step listing wizard (autoplius-style). */

export { VEHICLE_MAKES, MODELS_BY_MAKE } from "@/data/vehicle-makes-models";
export {
  MODIFICATIONS_BY_MODEL,
  VEHICLE_CATALOG_MIN_CONFIDENCE,
  applyVehicleCatalogSpecs,
  modificationsFor,
  type VehicleModification,
} from "@vauto/shared/vehicle-spec-catalog";

import { modificationsFor } from "@vauto/shared/vehicle-spec-catalog";

export const BODY_TYPES = [
  "Sedanas",
  "Hečbekas",
  "Universalas",
  "Visureigis / SUV",
  "Vienatūris",
  "Kupė (Coupe)",
  "Kabrioletas",
  "Pikapas",
  "Komercinis",
] as const;

export const FUEL_TYPES = [
  "Benzinas",
  "Dyzelinas",
  "Elektra",
  "Benzinas / dujos",
  "Benzinas / elektra",
  "Dyzelinas / elektra",
  "Dujos",
] as const;

export const GEARBOX_TYPES = ["Mechaninė", "Automatinė"] as const;

export const DRIVE_TYPES = [
  "Priekiniai (FWD)",
  "Galiniai (RWD)",
  "Visi varantys (AWD / 4x4)",
] as const;

export const DOOR_COUNTS = ["2/3", "4/5", "Kita"] as const;

export const DEFECT_OPTIONS = [
  "Be defektų",
  "Daužtas",
  "Su variklio defektu",
  "Su pavarų dėžės defektu",
  "Kitas defektas",
] as const;

export const STEERING_OPTIONS = ["Kairėje", "Dešinėje"] as const;

/** Autoplius papildomos opcijos (checkbox masyvas → vehicleOptions) */
export const VEHICLE_EQUIPMENT_OPTIONS = [
  "Kondicionierius / Klimato kontrolė",
  "Odinis salonas",
  "Panoraminis stogas",
  "LED / Xenon žibintai",
  "Navigacija / GPS",
  "Atstumo jutikliai",
  "Atbulinės eigos kamera",
  "Kruizo kontrolė (Autopilotas)",
  "Šildomos sėdynės",
  "Lengvojo lydinio ratlankiai",
] as const;

export const COLOR_OPTIONS = [
  "Juoda",
  "Balta",
  "Sidabrinė",
  "Pilka",
  "Mėlyna",
  "Raudona",
  "Žalia",
  "Kita",
] as const;

export const REGISTRATION_YEARS = Array.from(
  { length: 2026 - 1985 + 1 },
  (_, i) => String(2026 - i)
);

export const REGISTRATION_MONTHS = [
  { value: "", label: "—" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: String(i + 1).padStart(2, "0"),
  })),
];

export { modelsForMake } from "@/data/vehicle-makes-models";

export function engineCcSuggestions(make: string, model: string): string[] {
  const mods = modificationsFor(make, model);
  const set = new Set(mods.map((m) => m.engineCc).filter(Boolean) as string[]);
  return [...set];
}

export function powerKwSuggestions(make: string, model: string): string[] {
  const mods = modificationsFor(make, model);
  const set = new Set(mods.map((m) => m.powerKw).filter(Boolean) as string[]);
  return [...set];
}

export function vehicleSummaryLabel(
  attrs: Record<string, string | string[] | undefined>
): string {
  const make = String(attrs.make ?? "").trim();
  const model = String(attrs.model ?? "").trim();
  const year = String(attrs.year ?? "").trim();
  if (!make && !model) return "";
  const base = [make, model].filter(Boolean).join(" ");
  return year ? `${base} | ${year}` : base;
}
