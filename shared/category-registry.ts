/**
 * VAUTO Universal Category Registry — single source of truth.
 * App types, validation, adaptive UI, and docs schema must stay aligned.
 */

export const LISTING_CATEGORY_IDS = [
  "vehicles",
  "transport",
  "real_estate",
  "clothing",
  "electronics",
  "home",
  "tools",
  "rental",
  "services",
  "jobs",
  "other",
] as const;

export type RegistryListingCategory = (typeof LISTING_CATEGORY_IDS)[number];

/**
 * F7 — canonical user-facing category labels. Canonical IDs are UNCHANGED;
 * the user sees exactly 8 top-level categories. Legacy slugs fold into the
 * closest visible category (never renamed, never removed):
 *   transport → Transportas · tools → Namai ir buitis · rental → Kita.
 */
export const LISTING_CATEGORY_LABELS: Record<RegistryListingCategory, string> = {
  vehicles: "Transportas",
  transport: "Transportas",
  real_estate: "Nekilnojamas turtas",
  clothing: "Mada",
  electronics: "Elektronika",
  home: "Namai ir buitis",
  tools: "Namai ir buitis",
  rental: "Kita",
  services: "Paslaugos",
  jobs: "Darbas",
  other: "Kita",
};

/** The 8 top-level categories the user can see (primary slug per category). */
export const VISIBLE_CATEGORY_IDS = [
  "vehicles",
  "real_estate",
  "electronics",
  "clothing",
  "home",
  "services",
  "jobs",
  "other",
] as const;

export type VisibleCategoryId = (typeof VISIBLE_CATEGORY_IDS)[number];

/** Which visible category a legacy slug belongs to (for filters/labels). */
export const VISIBLE_CATEGORY_BY_SLUG: Record<RegistryListingCategory, VisibleCategoryId> = {
  vehicles: "vehicles",
  transport: "vehicles",
  real_estate: "real_estate",
  clothing: "clothing",
  electronics: "electronics",
  home: "home",
  tools: "home",
  rental: "other",
  services: "services",
  jobs: "jobs",
  other: "other",
};

/** User-facing label for ANY canonical slug (legacy slugs fold into the 8). */
export function listingCategoryLabel(category: unknown): string {
  const slug = String(category ?? "other");
  if (isListingCategoryId(slug)) {
    return LISTING_CATEGORY_LABELS[VISIBLE_CATEGORY_BY_SLUG[slug]];
  }
  return LISTING_CATEGORY_LABELS.other;
}

/** Deterministic (label, slug) options for user-facing category pickers. */
export function visibleCategoryOptions(): Array<{
  id: VisibleCategoryId;
  label: string;
}> {
  return VISIBLE_CATEGORY_IDS.map((id) => ({ id, label: LISTING_CATEGORY_LABELS[id] }));
}

/** Categories that use vehicle/VIN/OCR extractors. */
export const VEHICLE_FAMILY_CATEGORIES = new Set<RegistryListingCategory>([
  "vehicles",
  "transport",
]);

export function isListingCategoryId(value: unknown): value is RegistryListingCategory {
  return (
    typeof value === "string" &&
    (LISTING_CATEGORY_IDS as readonly string[]).includes(value)
  );
}

const CATEGORY_ALIASES: Record<string, RegistryListingCategory> = {
  automobiliai: "vehicles",
  auto: "vehicles",
  cars: "vehicles",
  car: "vehicles",
  transportas: "transport",
  moto: "transport",
  motociklai: "transport",
  priekaba: "transport",
  priekabos: "transport",
  trailer: "transport",
  trailers: "transport",
  nt: "real_estate",
  nekilnojamas: "real_estate",
  nekilnojamas_turtas: "real_estate",
  realestate: "real_estate",
  fashion: "clothing",
  apparel: "clothing",
  mada: "clothing",
  apranga: "clothing",
  drabuziai: "clothing",
  elektronika: "electronics",
  phones: "electronics",
  telefonai: "electronics",
  appliances: "home",
  buitis: "home",
  namai: "home",
  baldai: "home",
  furniture: "home",
  irankiai: "tools",
  tools: "tools",
  nuoma: "rental",
  rental: "rental",
  paslaugos: "services",
  service: "services",
  services: "services",
  remontas: "services",
  stogai: "services",
  stogu_dengimas: "services",
  roofing: "services",
  darbas: "jobs",
  jobs: "jobs",
  job: "jobs",
  employment: "jobs",
  kita: "other",
  other: "other",
  general: "other",
  miscellaneous: "other",
  kitos_prekes: "other",
  kitosprekes: "other",
  // AI / vision non-standard labels
  automobiliai_lt: "vehicles",
  hot_tub: "rental",
  hottub: "rental",
  spa: "home",
  jacuzzi: "home",
  kubilas: "home",
  baseinas: "home",
  muzika: "electronics",
  music: "electronics",
  menas: "other",
  art: "other",
  sportas: "other",
  laisvalaikis: "other",
};

/** Infer a safe DB category from free-text title/description when AI label is novel. */
export function inferCategoryFromContext(
  title?: string,
  description?: string
): RegistryListingCategory | null {
  const blob = `${title ?? ""} ${description ?? ""}`.toLowerCase();
  if (!blob.trim()) return null;
  if (/\b(stog|roof|remont|paslaug|meistr|montav|įrengim|irengim)\w*/i.test(blob)) {
    return "services";
  }
  if (/\b(darbas|darbo\s*viet|ieškau\s*darbo|vadybinink|darbuotoj)\w*/i.test(blob)) {
    return "jobs";
  }
  if (/\b(butas|namas|sklypas|nt\b|kambarys|nuomojamas\s*but)\w*/i.test(blob)) {
    return "real_estate";
  }
  if (
    /\b(ratlank|ratai|ratus|padang|dis[kc]ai|dalys|bamper|kapot|žibint|zibint|r1[4-9])\w*/i.test(
      blob
    )
  ) {
    return "tools";
  }
  // F9 — car seat covers are HOME textiles, not vehicles: the explicit
  // seat-cover rule runs BEFORE the generic `automobil` prefix rule so
  // „automobilio sėdynių užvalkalai“ never lands in Transportas.
  if (
    /\b(sėdynių|sedyniu|sėdynės|sedynes|sėdyniu|sedynu)\s*(užvalkal|uzvalkal|užtiesal|uztiesal|apmušal|apmusal)\w*/i.test(
      blob
    )
  ) {
    return "home";
  }
  if (/\b(automobil|auto\b|bmw|audi|volvo|toyota|citroen|vin\b)\w*/i.test(blob)) {
    return "vehicles";
  }
  if (/\b(priekab|trailer|motocikl|dvirač|dvirat|valtis)\w*/i.test(blob)) {
    return "transport";
  }
  if (
    /\b(iphone|samsung|telefon|kompiuter|televiz|elektron|jbl|partybox|klaviat|keyboard|monitor)\w*/i.test(
      blob
    )
  ) {
    return "electronics";
  }
  if (/\b(suknel|kelnes|batai|striuk|mada|aprang|drabuž)\w*/i.test(blob)) {
    return "clothing";
  }
  if (/\b(sof|bald|stal|spint|lov|čiuzin|kubil|basein|jacuzzi|hot\s*tub)\w*/i.test(blob)) {
    return "home";
  }
  if (/\b(įrank|irank|grąžt|suktuv|pjūkl)\w*/i.test(blob)) {
    return "tools";
  }
  if (/\b(nuom|rental|išnuom)\w*/i.test(blob)) {
    return "rental";
  }
  return null;
}

export function normalizeListingCategoryId(
  value: unknown,
  fallback: RegistryListingCategory = "other"
): RegistryListingCategory {
  if (isListingCategoryId(value)) return value;
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ąčęėįšųūž_\s-]/gi, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!raw) return fallback;
  if (isListingCategoryId(raw)) return raw;
  if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];
  // Loose contains match against alias keys / labels.
  for (const [alias, cat] of Object.entries(CATEGORY_ALIASES)) {
    if (raw.includes(alias) || alias.includes(raw)) return cat;
  }
  return fallback;
}

/**
 * Coerce ANY AI/vision category string into a valid DB slug.
 * Never returns an unmapped raw label — always a LISTING_CATEGORY_IDS value.
 */
export function coerceListingCategoryForDb(
  value: unknown,
  context?: { title?: string; description?: string; fallback?: RegistryListingCategory }
): RegistryListingCategory {
  const fallback = context?.fallback ?? "other";
  if (isListingCategoryId(value)) return value;
  const normalized = normalizeListingCategoryId(value, fallback);
  // If AI sent a novel label that only fell through to default, try context.
  const raw = String(value ?? "").trim();
  if (
    raw &&
    !isListingCategoryId(raw.toLowerCase()) &&
    normalized === fallback
  ) {
    const inferred = inferCategoryFromContext(context?.title, context?.description);
    if (inferred) return inferred;
  }
  return normalized;
}

/**
 * F9 — physical-item categories require an explicit condition. Single
 * canonical source shared by the client and the server PrePublish readiness.
 */
export const CONDITION_REQUIRED_CATEGORIES = new Set<RegistryListingCategory>([
  "vehicles",
  "transport",
  "electronics",
  "clothing",
  "home",
  "tools",
  "other",
  "rental",
]);

export function isVehicleFamilyCategory(category: unknown): boolean {
  return VEHICLE_FAMILY_CATEGORIES.has(normalizeListingCategoryId(category));
}
