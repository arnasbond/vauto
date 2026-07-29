/**
 * Vehicle modification benchmark catalog — used when make/model are known
 * but tech passport / VIN docs were not uploaded.
 * Soft-fill only (never overwrite OCR/VIN facts). Min confidence: 0.70.
 */

export const VEHICLE_CATALOG_MIN_CONFIDENCE = 0.7;

export interface VehicleModification {
  id: string;
  label: string;
  bodyType: string;
  fuelType: string;
  doors: string;
  engineCc?: string;
  powerKw?: string;
  transmission?: string;
}

/** Canonical make|model → known LT-market modifications. */
export const MODIFICATIONS_BY_MODEL: Record<string, VehicleModification[]> = {
  "Citroën|DS5": [
    {
      id: "ds5-thp200",
      label: "1.6 THP (200 Hp)",
      bodyType: "Hečbekas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1598",
      powerKw: "147",
      transmission: "Mechaninė",
    },
    {
      id: "ds5-ehdi115",
      label: "1.6 e-HDi (115 Hp) Airdream EGS6",
      bodyType: "Hečbekas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1560",
      powerKw: "85",
      transmission: "Automatinė",
    },
    {
      id: "ds5-hdi160",
      label: "2.0 HDi (160 Hp) Automatic",
      bodyType: "Hečbekas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1997",
      powerKw: "120",
      transmission: "Automatinė",
    },
    {
      id: "ds5-thp155",
      label: "1.6 THP (155 Hp) Automatic",
      bodyType: "Hečbekas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1598",
      powerKw: "114",
      transmission: "Automatinė",
    },
  ],
  "Volkswagen|Golf": [
    {
      id: "golf-14tsi",
      label: "1.4 TSI",
      bodyType: "Hečbekas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1395",
      powerKw: "92",
    },
    {
      id: "golf-20tdi",
      label: "2.0 TDI",
      bodyType: "Hečbekas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1968",
      powerKw: "110",
    },
  ],
  "BMW|320": [
    {
      id: "bmw-320d",
      label: "320d",
      bodyType: "Sedanas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "1995",
      powerKw: "140",
    },
    {
      id: "bmw-320i",
      label: "320i",
      bodyType: "Sedanas",
      fuelType: "Benzinas",
      doors: "4/5",
      engineCc: "1998",
      powerKw: "135",
    },
  ],
  "Toyota|Corolla": [
    {
      id: "corolla-hybrid",
      label: "1.8 Hybrid",
      bodyType: "Hečbekas",
      fuelType: "Hibridas",
      doors: "4/5",
      engineCc: "1798",
      powerKw: "90",
    },
  ],
  "Volvo|V70": [
    {
      id: "v70-d5",
      label: "2.4 D5",
      bodyType: "Universalas",
      fuelType: "Dyzelinas",
      doors: "4/5",
      engineCc: "2400",
      powerKw: "136",
    },
  ],
};

const MAKE_ALIASES: Record<string, string> = {
  citroen: "Citroën",
  citroën: "Citroën",
  vw: "Volkswagen",
  volkswagen: "Volkswagen",
  bmw: "BMW",
  toyota: "Toyota",
  volvo: "Volvo",
  skoda: "Škoda",
  škoda: "Škoda",
  mercedes: "Mercedes-Benz",
  "mercedes-benz": "Mercedes-Benz",
};

function normalizeMake(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const alias = MAKE_ALIASES[t.toLowerCase()];
  return alias || t;
}

function normalizeModel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function catalogKey(make: string, model: string): string {
  return `${normalizeMake(make)}|${normalizeModel(model)}`;
}

export function modificationsFor(make: string, model: string): VehicleModification[] {
  const key = catalogKey(make, model);
  if (MODIFICATIONS_BY_MODEL[key]) return MODIFICATIONS_BY_MODEL[key]!;
  // Soft match model contains (e.g. "DS5 Exclusive" → DS5)
  const makeN = normalizeMake(make).toLowerCase();
  const modelN = normalizeModel(model).toLowerCase();
  if (!makeN || !modelN) return [];
  for (const [k, mods] of Object.entries(MODIFICATIONS_BY_MODEL)) {
    const [mk, md] = k.split("|");
    if (!mk || !md) continue;
    if (mk.toLowerCase() !== makeN) continue;
    if (modelN === md.toLowerCase() || modelN.includes(md.toLowerCase())) {
      return mods;
    }
  }
  return [];
}

function attrGet(
  attrs: Record<string, string | string[] | undefined>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const raw = attrs[key];
    const value = Array.isArray(raw) ? raw.map(String).join(", ") : String(raw ?? "");
    if (value.trim()) return value.trim();
  }
  return "";
}

function pickModification(
  mods: VehicleModification[],
  hints: string
): VehicleModification {
  const h = hints.toLowerCase();
  const scored = mods.map((m) => {
    let score = 0;
    if (m.fuelType && h.includes(m.fuelType.toLowerCase())) score += 3;
    if (/dyzel|diesel|hdi|tdi|cdi/.test(h) && /dyzel/i.test(m.fuelType)) score += 4;
    if (/benzin|petrol|thp|tsi|tfsi/.test(h) && /benzin/i.test(m.fuelType)) score += 4;
    if (/hibrid|hybrid/.test(h) && /hibrid/i.test(m.fuelType)) score += 4;
    if (m.engineCc && h.includes(m.engineCc)) score += 2;
    if (m.powerKw && h.includes(m.powerKw)) score += 2;
    if (m.label && h.includes(m.label.toLowerCase().slice(0, 8))) score += 1;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score > 0) return scored[0].m;
  // Prefer diesel as LT-market default when no hint — still marked as suggestion.
  const diesel = mods.find((m) => /dyzel/i.test(m.fuelType));
  return diesel ?? mods[0]!;
}

function consensus(mods: VehicleModification[], key: keyof VehicleModification): string {
  const values = mods
    .map((m) => String(m[key] ?? "").trim())
    .filter(Boolean);
  if (!values.length) return "";
  const first = values[0]!;
  return values.every((v) => v === first) ? first : "";
}

export interface CatalogEnrichResult {
  attributes: Record<string, string | string[] | undefined>;
  applied: boolean;
  modification?: VehicleModification;
}

/**
 * Soft-fill missing vehicle tech fields from catalog when make+model known
 * and confidence ≥ 70%. Never overwrites existing VIN/OCR values.
 */
export function applyVehicleCatalogSpecs(
  attrsIn: Record<string, string | string[] | undefined> | undefined,
  opts?: {
    confidence?: number;
    title?: string;
    description?: string;
    minConfidence?: number;
  }
): CatalogEnrichResult {
  const attrs: Record<string, string | string[] | undefined> = {
    ...(attrsIn ?? {}),
  };
  const minConf = opts?.minConfidence ?? VEHICLE_CATALOG_MIN_CONFIDENCE;
  const confidence = Number(
    opts?.confidence ??
      attrGet(attrs, "visionConfidence", "specConfidence", "confidence") ??
      0.75
  );
  if (!Number.isFinite(confidence) || confidence < minConf) {
    return { attributes: attrs, applied: false };
  }

  // Skip when tech passport already verified the car — catalog is fallback only.
  const hasDoc =
    String(attrs.hasTechPassport ?? attrs.techPassportVerified ?? "")
      .toLowerCase() === "true" ||
    String(attrs.documentRoles ?? "").toLowerCase().includes("tech") ||
    String(attrs.galleryRoles ?? "").toLowerCase().includes("tech_passport");
  if (hasDoc) {
    return { attributes: attrs, applied: false };
  }

  const make = attrGet(attrs, "make", "brand");
  const model = attrGet(attrs, "model");
  if (!make || !model) return { attributes: attrs, applied: false };

  const mods = modificationsFor(make, model);
  if (!mods.length) return { attributes: attrs, applied: false };

  const hints = [
    opts?.title ?? "",
    opts?.description ?? "",
    attrGet(attrs, "engine", "fuelType", "fuel", "powerKw", "modification"),
  ].join(" ");

  const picked = pickModification(mods, hints);
  let filled = 0;

  const fillIfEmpty = (key: string, value: string | undefined) => {
    if (!value?.trim()) return;
    if (attrGet(attrs, key)) return;
    attrs[key] = value.trim();
    filled += 1;
  };

  // Consensus across all mods first (safe).
  fillIfEmpty("bodyType", consensus(mods, "bodyType"));
  fillIfEmpty("doors", consensus(mods, "doors"));

  // Soft suggestion from best-matching modification.
  fillIfEmpty("fuelType", picked.fuelType);
  fillIfEmpty("engineCc", picked.engineCc);
  fillIfEmpty("powerKw", picked.powerKw);
  fillIfEmpty("transmission", picked.transmission);
  if (picked.engineCc && !attrGet(attrs, "engine")) {
    const liters = Math.round((Number(picked.engineCc) / 1000) * 10) / 10;
    if (liters > 0.5 && liters < 10) {
      attrs.engine = String(liters);
      filled += 1;
    }
  }

  if (filled === 0) return { attributes: attrs, applied: false };

  attrs.specSource = "catalog";
  attrs.specConfidence = confidence.toFixed(2);
  attrs.catalogModificationId = picked.id;
  attrs.catalogModificationLabel = picked.label;
  attrs.catalogNote =
    "Techniniai duomenys pasiūlyti iš katalogo pagal markę/modelį (~70%+). Patikrinkite PrePublish lange.";
  if (mods.length > 1) {
    attrs.catalogAlternatives = mods.map((m) => m.label).join(" | ");
  }

  // Canonical make for Citroën etc.
  attrs.make = normalizeMake(make);
  if (!attrGet(attrs, "model")) attrs.model = normalizeModel(model);

  return { attributes: attrs, applied: true, modification: picked };
}
