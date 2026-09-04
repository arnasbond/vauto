import { isVerticalId } from "./registry";
import type { VerticalId, VerticalUiSlug } from "./types";
import { VERTICAL_UI_SLUGS } from "./types";

const UI_SLUG_TO_ID: Record<VerticalUiSlug, VerticalId> = {
  transport: "TRANSPORT",
  real_estate: "REAL_ESTATE",
  electronics: "ELECTRONICS",
  services: "SERVICES",
  jobs: "JOBS",
  home: "HOME_GARDEN",
  clothing: "CLOTHING",
  other: "OTHER",
};

/**
 * Deterministic legacy / alias → canonical vertical.
 * Unknown values return null (fail-closed — never invent TRANSPORT/payment).
 */
const LEGACY_TO_VERTICAL: Record<string, VerticalId> = {
  transport: "TRANSPORT",
  TRANSPORT: "TRANSPORT",
  vehicles: "TRANSPORT",
  vehicle: "TRANSPORT",
  auto: "TRANSPORT",
  cars: "TRANSPORT",
  car: "TRANSPORT",
  automobiliai: "TRANSPORT",
  transportas: "TRANSPORT",
  moto: "TRANSPORT",
  motociklai: "TRANSPORT",
  trailer: "TRANSPORT",
  priekaba: "TRANSPORT",
  real_estate: "REAL_ESTATE",
  REAL_ESTATE: "REAL_ESTATE",
  "real-estate": "REAL_ESTATE",
  realestate: "REAL_ESTATE",
  property: "REAL_ESTATE",
  nt: "REAL_ESTATE",
  nekilnojamas: "REAL_ESTATE",
  nekilnojamasis: "REAL_ESTATE",
  nekilnojamas_turtas: "REAL_ESTATE",
  electronics: "ELECTRONICS",
  ELECTRONICS: "ELECTRONICS",
  elektronika: "ELECTRONICS",
  phones: "ELECTRONICS",
  telefonai: "ELECTRONICS",
  services: "SERVICES",
  SERVICES: "SERVICES",
  service: "SERVICES",
  paslaugos: "SERVICES",
  jobs: "JOBS",
  JOBS: "JOBS",
  job: "JOBS",
  darbas: "JOBS",
  employment: "JOBS",
  home: "HOME_GARDEN",
  HOME_GARDEN: "HOME_GARDEN",
  home_garden: "HOME_GARDEN",
  "home-garden": "HOME_GARDEN",
  namai: "HOME_GARDEN",
  sodas: "HOME_GARDEN",
  garden: "HOME_GARDEN",
  furniture: "HOME_GARDEN",
  baldai: "HOME_GARDEN",
};

function normalizeAlias(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

/** Canonical ID or null. Never defaults to a privileged vertical. */
export function resolveVerticalId(value: unknown): VerticalId | null {
  if (isVerticalId(value)) return value;
  const raw = normalizeAlias(value);
  if (!raw) return null;
  if (isVerticalId(raw)) return raw;
  const lower = raw.toLowerCase();
  if ((VERTICAL_UI_SLUGS as readonly string[]).includes(lower)) {
    return UI_SLUG_TO_ID[lower as VerticalUiSlug];
  }
  return LEGACY_TO_VERTICAL[raw] ?? LEGACY_TO_VERTICAL[lower] ?? null;
}

export function verticalIdToUiSlug(id: VerticalId): VerticalUiSlug {
  switch (id) {
    case "TRANSPORT":
      return "transport";
    case "REAL_ESTATE":
      return "real_estate";
    case "ELECTRONICS":
      return "electronics";
    case "SERVICES":
      return "services";
    case "JOBS":
      return "jobs";
    case "HOME_GARDEN":
      return "home";
    case "CLOTHING":
      return "clothing";
    case "OTHER":
      return "other";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export const LEGACY_MAPPING_FIXTURES: ReadonlyArray<{
  from: string;
  to: VerticalId;
}> = [
  { from: "auto", to: "TRANSPORT" },
  { from: "cars", to: "TRANSPORT" },
  { from: "vehicle", to: "TRANSPORT" },
  { from: "vehicles", to: "TRANSPORT" },
  { from: "real-estate", to: "REAL_ESTATE" },
  { from: "property", to: "REAL_ESTATE" },
  { from: "nt", to: "REAL_ESTATE" },
  { from: "elektronika", to: "ELECTRONICS" },
  { from: "paslaugos", to: "SERVICES" },
  { from: "darbas", to: "JOBS" },
  { from: "namai", to: "HOME_GARDEN" },
];
