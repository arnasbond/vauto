import { VERTICAL_ATTRIBUTES } from "./attributes.js";
import { VERTICAL_CAPABILITIES } from "./capabilities.js";
import type { MarketplaceVertical, VerticalId } from "./types.js";
import { VERTICAL_IDS } from "./types.js";

export const CANONICAL_VERTICALS: readonly MarketplaceVertical[] = [
  {
    id: "TRANSPORT",
    uiSlug: "transport",
    label: "Transportas",
    description: "Lengvieji, motociklai, priekabos ir kitas transportas.",
    listingKind: "VEHICLE",
    searchQuery: "transportas",
    capabilities: VERTICAL_CAPABILITIES.TRANSPORT,
    attributes: VERTICAL_ATTRIBUTES.TRANSPORT,
  },
  {
    id: "REAL_ESTATE",
    uiSlug: "real_estate",
    label: "Nekilnojamasis turtas",
    description: "Butai, namai, sklypai — ne siuntomis pristatoma prekė.",
    listingKind: "REAL_ESTATE",
    searchQuery: "butas NT",
    capabilities: VERTICAL_CAPABILITIES.REAL_ESTATE,
    attributes: VERTICAL_ATTRIBUTES.REAL_ESTATE,
  },
  {
    id: "ELECTRONICS",
    uiSlug: "electronics",
    label: "Elektronika",
    description: "Telefonai, kompiuteriai ir kita technika.",
    listingKind: "PHYSICAL_GOOD",
    searchQuery: "elektronika",
    capabilities: VERTICAL_CAPABILITIES.ELECTRONICS,
    attributes: VERTICAL_ATTRIBUTES.ELECTRONICS,
  },
  {
    id: "SERVICES",
    uiSlug: "services",
    label: "Paslaugos",
    description: "Darbai ir paslaugos su terminu, ne prekės siunta.",
    listingKind: "SERVICE",
    searchQuery: "paslaugos",
    capabilities: VERTICAL_CAPABILITIES.SERVICES,
    attributes: VERTICAL_ATTRIBUTES.SERVICES,
  },
  {
    id: "JOBS",
    uiSlug: "jobs",
    label: "Darbas",
    description: "Darbo skelbimai ir kandidatūros — ne e-commerce pirkimas.",
    listingKind: "JOB_POSTING",
    searchQuery: "darbas",
    capabilities: VERTICAL_CAPABILITIES.JOBS,
    attributes: VERTICAL_ATTRIBUTES.JOBS,
  },
  {
    id: "HOME_GARDEN",
    uiSlug: "home",
    label: "Namai ir sodas",
    description: "Baldai, sodo technika ir namų prekės.",
    listingKind: "PHYSICAL_GOOD",
    searchQuery: "namai sodas",
    capabilities: VERTICAL_CAPABILITIES.HOME_GARDEN,
    attributes: VERTICAL_ATTRIBUTES.HOME_GARDEN,
  },
] as const satisfies readonly MarketplaceVertical[];

const BY_ID = Object.fromEntries(
  CANONICAL_VERTICALS.map((v) => [v.id, v])
) as Record<VerticalId, MarketplaceVertical>;

export function getVertical(id: VerticalId): MarketplaceVertical {
  return BY_ID[id];
}

export function isVerticalId(value: unknown): value is VerticalId {
  return typeof value === "string" && (VERTICAL_IDS as readonly string[]).includes(value);
}
