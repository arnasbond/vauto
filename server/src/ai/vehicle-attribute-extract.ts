/** Server-side vehicle attribute normalization (mirrors src/lib/vehicle-attribute-extract.ts). */

const VEHICLE_MAKES = [
  "Audi",
  "BMW",
  "Citroën",
  "Dacia",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Kia",
  "Mazda",
  "Mercedes-Benz",
  "Nissan",
  "Opel",
  "Peugeot",
  "Renault",
  "Seat",
  "Škoda",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "Kita",
] as const;

const MODELS_BY_MAKE: Record<string, string[]> = {
  Citroën: ["Kita", "C1", "C3", "C4", "C5", "Berlingo", "DS3", "DS4", "DS5", "DS7", "Xsara"],
  Volkswagen: ["Kita", "Golf", "Passat", "Polo", "Tiguan", "Touran", "Transporter"],
  BMW: ["Kita", "320", "520", "X1", "X3", "X5", "118", "218"],
  Audi: ["Kita", "A3", "A4", "A6", "Q3", "Q5", "Q7"],
  Toyota: ["Kita", "Corolla", "Yaris", "RAV4", "Avensis", "C-HR"],
  Opel: ["Kita", "Astra", "Corsa", "Insignia", "Mokka", "Zafira"],
  Ford: ["Kita", "Focus", "Fiesta", "Mondeo", "Kuga", "Transit"],
  Peugeot: ["Kita", "208", "308", "3008", "508", "Partner"],
  Renault: ["Kita", "Clio", "Megane", "Captur", "Scenic", "Kangoo"],
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
};

const BRAND_RE =
  /\b(bmw|audi|vw|volkswagen|mercedes|benz|toyota|opel|ford|peugeot|citroen|citroën|renault|skoda|škoda|seat|nissan|honda|mazda|volvo|kia|hyundai)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function modelsForMake(make: string): string[] {
  return MODELS_BY_MAKE[make] ?? ["Kita"];
}

function detectMake(text: string): string | null {
  const m = text.match(BRAND_RE);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return MAKE_ALIASES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function normalizeMake(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const alias = MAKE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  const exact = VEHICLE_MAKES.find((m) => m.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  return detectMake(trimmed);
}

function normalizeYear(raw: string | number): string | null {
  const digits = String(raw).replace(/\D/g, "");
  const yearStr = digits.length === 4 ? digits : String(raw).match(/\b(19|20)\d{2}\b/)?.[0];
  if (!yearStr) return null;
  const year = Number(yearStr);
  if (year < 1985 || year > 2026) return null;
  return String(year);
}

function normalizeModel(make: string, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const catalog = modelsForMake(make);
  const lower = trimmed.toLowerCase();
  const exact = catalog.find((m) => m.toLowerCase() === lower);
  if (exact) return exact;
  const contained = catalog.find(
    (m) => m !== "Kita" && lower.includes(m.toLowerCase())
  );
  if (contained) return contained;
  const token = catalog.find(
    (m) => m !== "Kita" && new RegExp(`\\b${escapeRegExp(m)}\\b`, "i").test(trimmed)
  );
  return token ?? trimmed;
}

function extractFromText(text: string): Record<string, string> {
  const patch: Record<string, string> = {};
  const make = normalizeMake(text) ?? detectMake(text);
  if (make) patch.make = make;

  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = normalizeYear(yearMatch[0]);
    if (year) patch.year = year;
  }

  if (patch.make) {
    for (const model of modelsForMake(patch.make)) {
      if (model === "Kita") continue;
      if (new RegExp(`\\b${escapeRegExp(model)}\\b`, "i").test(text)) {
        patch.model = normalizeModel(patch.make, model);
        break;
      }
    }
    if (!patch.model) {
      const tokens = text.match(/\b([A-Za-z]{1,3}\d{1,3}[a-z]?|\d{3,4}[a-z]{0,2})\b/g);
      const candidate = tokens?.find((t) => !/^\d{4}$/.test(t));
      if (candidate) patch.model = normalizeModel(patch.make, candidate);
    }
  }

  const vin = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
  if (vin) patch.vin = vin[0].toUpperCase();

  return patch;
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

  if (args.make != null && String(args.make).trim()) base.make = String(args.make).trim();
  if (args.model != null && String(args.model).trim()) base.model = String(args.model).trim();
  if (args.year != null && String(args.year).trim()) base.year = String(args.year).trim();

  return base;
}

export function enrichVehicleListingDraftFromArgs(
  title: string,
  description: string,
  category: string,
  attributes: Record<string, string>
): { title: string; description: string; category: string; attributes: Record<string, string> } {
  const combined = `${title} ${description}`.trim();
  const extracted = extractFromText(combined);
  const attrs = { ...attributes };

  for (const [key, value] of Object.entries(extracted)) {
    if (value && !attrs[key]?.trim()) attrs[key] = value;
  }

  if (attrs.make) attrs.make = normalizeMake(attrs.make) ?? attrs.make;
  if (attrs.make && attrs.model) attrs.model = normalizeModel(attrs.make, attrs.model);
  if (attrs.year) {
    const y = normalizeYear(attrs.year);
    if (y) attrs.year = y;
  }

  if (!attrs.defects) attrs.defects = "Be defektų";
  if (!attrs.steering) attrs.steering = "Kairėje";

  let nextTitle = title.trim();
  const make = attrs.make;
  const model = attrs.model;
  const year = attrs.year;
  if (make && model && (!nextTitle || nextTitle === "Skelbimas")) {
    nextTitle = `${make} ${model}${year ? ` ${year}` : ""}`.trim();
  }

  const nextCategory =
    category === "vehicles" || make || BRAND_RE.test(combined) ? "vehicles" : category;

  return {
    title: nextTitle,
    description,
    category: nextCategory,
    attributes: attrs,
  };
}
