import {
  VEHICLE_MAKES,
  modelsForMake,
} from "@/lib/vehicle-catalog";
import {
  detectVehicleMake,
  extractPlateFromQuery,
  extractVinFromQuery,
  isVehicleQuery,
  VEHICLE_BRAND_PATTERN,
} from "@/lib/vehicle-keywords";

export interface VehicleAttributePatch {
  make?: string;
  model?: string;
  year?: string;
  mileage?: string;
  fuelType?: string;
  engine?: string;
  powerKw?: string;
  vin?: string;
  plateNumber?: string;
}

export type VehicleDraftLike = {
  title?: string;
  description?: string;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
};

const MAKE_ALIASES: Record<string, string> = {
  vw: "Volkswagen",
  volkswagen: "Volkswagen",
  benz: "Mercedes-Benz",
  mercedes: "Mercedes-Benz",
  "mercedes-benz": "Mercedes-Benz",
  citroen: "Citroën",
  citroën: "Citroën",
  skoda: "Škoda",
  škoda: "Škoda",
  bmw: "BMW",
  audi: "Audi",
  toyota: "Toyota",
  opel: "Opel",
  ford: "Ford",
  peugeot: "Peugeot",
  renault: "Renault",
  seat: "Seat",
  nissan: "Nissan",
  honda: "Honda",
  mazda: "Mazda",
  volvo: "Volvo",
  kia: "Kia",
  hyundai: "Hyundai",
  dacia: "Dacia",
  fiat: "Fiat",
};

const FUEL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(dyzel|dyzelin|dizel|dizelis|diesel)\b/i, label: "Dyzelinas" },
  { re: /\b(benzin|benzinui|petrol|gasoline)\b/i, label: "Benzinas" },
  { re: /\b(hybrid|hibrid)\b/i, label: "Hibridas" },
  { re: /\b(elektr|ev\b|bev\b)/i, label: "Elektra" },
  { re: /\b(lpg|duj|gaz)\b/i, label: "Dujos (LPG)" },
];

function attrString(
  attrs: Record<string, string | string[] | undefined> | undefined,
  key: string
): string {
  const v = attrs?.[key];
  if (Array.isArray(v)) return v.join(", ").trim();
  return String(v ?? "").trim();
}

export function normalizeVehicleMake(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const alias = MAKE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  const fromDetect = detectVehicleMake(trimmed);
  if (fromDetect) return fromDetect;

  const exact = VEHICLE_MAKES.find(
    (m) => m.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return exact;

  const contains = VEHICLE_MAKES.find(
    (m) =>
      m !== "Kita" &&
      (trimmed.toLowerCase().includes(m.toLowerCase()) ||
        m.toLowerCase().includes(trimmed.toLowerCase()))
  );
  return contains ?? null;
}

export function normalizeVehicleYear(raw: string | number): string | null {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length !== 4) {
    const m = String(raw).match(/\b(19|20)\d{2}\b/);
    if (!m) return null;
    return normalizeVehicleYear(m[0]);
  }
  const year = Number(digits);
  if (year < 1985 || year > 2026) return null;
  return String(year);
}

/** Collapse whitespace only — never strip Grand/Gran/Avant/xDrive/etc. */
export function preserveVerbatimVehicleModel(raw: string): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Exact model fidelity: NEVER truncate "Grand C4 Picasso" → "C4 Picasso".
 * Catalog may confirm spelling; it must never shorten a longer official designation.
 */
export function normalizeVehicleModel(make: string, raw: string): string {
  const trimmed = preserveVerbatimVehicleModel(raw);
  if (!trimmed) return "";

  const catalog = modelsForMake(make)
    .filter((m) => m !== "Kita")
    .sort((a, b) => b.length - a.length);
  const lower = trimmed.toLowerCase();

  const exact = catalog.find((m) => m.toLowerCase() === lower);
  if (exact) return trimmed;

  // If a shorter catalog name is merely contained, keep the FULL verbatim string.
  for (const entry of catalog) {
    if (!lower.includes(entry.toLowerCase())) continue;
    if (trimmed.length >= entry.length) return trimmed;
    return entry;
  }

  return trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractVehicleAttributesFromText(text: string): VehicleAttributePatch {
  const source = text.trim();
  if (!source) return {};

  const patch: VehicleAttributePatch = {};
  const make = normalizeVehicleMake(source) ?? detectVehicleMake(source);
  if (make) patch.make = make;

  const yearMatch = source.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = normalizeVehicleYear(yearMatch[0]);
    if (year) patch.year = year;
  }

  if (patch.make) {
    const model = extractModelFromText(source, patch.make);
    if (model) patch.model = normalizeVehicleModel(patch.make, model);
  }

  const mileageMatch = source.match(/(\d[\d\s.,]*)\s*(?:km|kilometr|rida)/i);
  if (mileageMatch) {
    patch.mileage = mileageMatch[1].replace(/\s/g, "").replace(",", "");
  }

  const engineMatch = source.match(/\b(\d[.,]\d)\s*(?:l|ltr|litrai?)\b/i);
  if (engineMatch) {
    patch.engine = engineMatch[1].replace(",", ".");
  }

  const powerMatch = source.match(/\b(\d{2,3})\s*(?:k\s*w|kw|kilovat)/i);
  if (powerMatch?.[1]) {
    const kw = Number(powerMatch[1]);
    if (kw >= 30 && kw <= 800) patch.powerKw = String(kw);
  }

  for (const { re, label } of FUEL_PATTERNS) {
    if (re.test(source)) {
      patch.fuelType = label;
      break;
    }
  }

  const vin = extractVinFromQuery(source);
  if (vin) patch.vin = vin;

  const plate = extractPlateFromQuery(source);
  if (plate) patch.plateNumber = plate;

  return patch;
}

function extractModelFromText(text: string, make: string): string | null {
  // Longest catalog match first so "C4 Picasso" wins over "C4".
  const catalog = modelsForMake(make)
    .filter((m) => m !== "Kita")
    .sort((a, b) => b.length - a.length);

  for (const model of catalog) {
    const re = new RegExp(
      `\\b((?:Grand|Gran|New|Allroad|Long)\\s+)?${escapeRegExp(model)}(?:\\s+(?:Avant|Combi|Variant|Tourer|Gran\\s*Tourer|Coupe|Coupé|Gran\\s*Coupe|Allroad|xDrive|Quattro|4Motion|Long))?\\b`,
      "i"
    );
    const hit = text.match(re);
    if (hit?.[0]) return preserveVerbatimVehicleModel(hit[0]);
  }

  const afterMake = text.replace(VEHICLE_BRAND_PATTERN, " ");
  // Capture multi-word official designations (e.g. Grand C4 Picasso).
  const multi = afterMake.match(
    /\b((?:Grand|Gran|New|Allroad)\s+)?[A-Za-z0-9][A-Za-z0-9.-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.-]*){0,4}\b/
  );
  if (multi?.[0] && !/^\d{4}$/.test(multi[0].trim())) {
    return preserveVerbatimVehicleModel(multi[0]);
  }

  const tokens = afterMake.match(
    /\b([A-Za-z]{1,3}\d{1,3}[a-z]?|\d{3,4}[a-z]{0,2}|[A-Z]{1,2}\d{1,2})\b/g
  );
  if (tokens?.length) {
    return tokens.find((t) => t.length >= 2 && !/^\d{4}$/.test(t)) ?? null;
  }

  return null;
}

export function looksLikeVehicleListingText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return isVehicleQuery(t);
}

/** Rebuild a clean technical description from structured attrs — never append/stack. */
export function buildVehicleDescriptionFromAttributes(
  attrs: Record<string, string | string[] | undefined> | undefined,
  opts?: { location?: string }
): string {
  const get = (key: string) => {
    const v = attrs?.[key];
    if (Array.isArray(v)) return v.map(String).join(", ").trim();
    return String(v ?? "").trim();
  };
  const make = get("make");
  const model = get("model");
  const year = get("year");
  const engine = get("engine");
  const fuelType = get("fuelType");
  const powerKw = get("powerKw");
  const mileage = get("mileage");
  const transmission = get("transmission");
  const bodyType = get("bodyType");
  const color = get("color");
  const plate = get("plate") || get("plateNumber");
  const trim = get("trim");
  const condition = get("condition");

  const sentences: string[] = [];
  const head = [make, model, year ? `${year} m.` : ""].filter(Boolean).join(" ");
  if (head) sentences.push(`${head}.`);

  const techBits: string[] = [];
  if (engine) techBits.push(`variklis ${engine}${/cm|l\b/i.test(engine) ? "" : " l"}`);
  if (powerKw) techBits.push(`${powerKw} kW`);
  if (fuelType) techBits.push(fuelType.toLowerCase());
  if (transmission) techBits.push(transmission.toLowerCase());
  if (techBits.length) {
    sentences.push(`Techniniai duomenys: ${techBits.join(", ")}.`);
  }

  const bodyBits: string[] = [];
  if (bodyType) bodyBits.push(bodyType);
  if (color) bodyBits.push(color.toLowerCase());
  if (trim) bodyBits.push(trim);
  if (mileage) bodyBits.push(`rida ${mileage}${/km/i.test(mileage) ? "" : " km"}`);
  if (bodyBits.length) sentences.push(`${bodyBits.join(", ")}.`);

  if (plate) sentences.push(`Valstybinis numeris: ${plate}.`);
  const interior = get("interiorCondition");
  const exterior = get("exteriorFeatures");
  if (interior) sentences.push(`Salonas: ${interior}.`);
  if (exterior) sentences.push(`Išorė: ${exterior}.`);
  if (condition) sentences.push(`Būklė: ${condition}.`);
  if (opts?.location?.trim()) sentences.push(`Vieta: ${opts.location.trim()}.`);

  return sentences.join(" ").trim().slice(0, 4000);
}

export function enrichVehicleListingDraft<T extends VehicleDraftLike>(
  draft: T,
  sourceTexts: string[] = []
): T {
  const combined = [draft.title, draft.description, ...sourceTexts]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (
    draft.category !== "vehicles" &&
    draft.category !== "transport" &&
    !looksLikeVehicleListingText(combined) &&
    !attrString(draft.attributes, "make")
  ) {
    return draft;
  }

  const extracted = extractVehicleAttributesFromText(combined);
  const attrs: Record<string, string> = {};

  for (const [key, value] of Object.entries(draft.attributes ?? {})) {
    if (value == null) continue;
    attrs[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  for (const [key, value] of Object.entries(extracted)) {
    if (value && !attrs[key]?.trim()) attrs[key] = value;
  }

  if (attrs.make) attrs.make = normalizeVehicleMake(attrs.make) ?? attrs.make;
  if (attrs.make && attrs.model) {
    attrs.model = normalizeVehicleModel(attrs.make, attrs.model);
  }
  if (attrs.year) {
    const normalizedYear = normalizeVehicleYear(attrs.year);
    if (normalizedYear) attrs.year = normalizedYear;
  }

  if (!attrs.defects) attrs.defects = "Be defektų";
  if (!attrs.steering) attrs.steering = "Kairėje";

  const make = attrs.make;
  const model = attrs.model;
  const year = attrs.year;
  let title = (draft.title ?? "").trim();
  if (make && model && (!title || title === "Skelbimas")) {
    title = `${make} ${model}${year ? ` ${year}` : ""}`.trim();
  }

  return {
    ...draft,
    title,
    attributes: attrs,
  };
}

export function mergeVehicleToolArgs(args: Record<string, unknown>): Record<string, string> {
  const base =
    args.attributes && typeof args.attributes === "object" && !Array.isArray(args.attributes)
      ? Object.fromEntries(
          Object.entries(args.attributes as Record<string, unknown>)
            .filter(([, v]) => v != null && String(v).trim())
            .map(([k, v]) => [k, String(v).trim()])
        )
      : {};

  if (args.make != null && String(args.make).trim()) {
    base.make = String(args.make).trim();
  }
  if (args.model != null && String(args.model).trim()) {
    base.model = String(args.model).trim();
  }
  if (args.year != null && String(args.year).trim()) {
    base.year = String(args.year).trim();
  }

  return base;
}
