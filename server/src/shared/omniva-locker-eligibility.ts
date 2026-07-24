/**
 * Omniva parcel locker eligibility — L-size max 39×38×64 cm, max 30 kg.
 * Hard-disable lockers for non-shippable categories and oversized goods.
 */

export const OMNIVA_LOCKER_MAX = {
  /** Longest edge (cm) */
  lengthCm: 64,
  /** Mid edge (cm) */
  widthCm: 39,
  /** Shortest edge (cm) */
  heightCm: 38,
  weightKg: 30,
} as const;

/** User-facing note when lockers are hidden (PrePublish / Escrow). */
export const OMNIVA_LOCKER_OVERSIZE_NOTE =
  "Prekė viršija paštomato matmenis (max 39×38×64 cm). Siūlomas atsiėmimas vietoje arba kurjeriu.";

export const OMNIVA_OVERSIZE_BLOCK_MESSAGE =
  "Pastebėjau, kad šis daiktas pagal savo matmenis ar svorį netilps į standartinį Omniva paštomatą. Kad išvengtume klaidingų siuntų užsakymų ir logistikos atmetimo, siuntimo būdą paštomatu šiam skelbimui išjungsime — pirkėjams bus siūlomas tik atsiėmimas gyvai arba kurjeris.";

export type OmnivaEstimatedSize = "S" | "M" | "L" | "OVERSIZED";

export type OmnivaLockerEligibility = {
  eligible: boolean;
  estimatedSize: OmnivaEstimatedSize;
  fitsOmnivaLocker: boolean;
  reason?: string;
  noteLt: string;
  /** Prefer pickup / courier when lockers are blocked. */
  defaultShipping: "locker" | "pickup_or_courier";
};

/** Categories that must NEVER offer Omniva lockers. */
const HARD_BLOCK_CATEGORIES = new Set([
  "vehicles",
  "transport",
  "automobiliai",
  "auto",
  "real_estate",
  "realestate",
  "nt",
  "jobs",
  "services",
  "paslaugos",
  "darbas",
  "rental",
  "nuoma",
]);

/** Bulky / heavy goods keywords (LT + EN) → force OVERSIZED. */
const BULKY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(sofa|sofos|kampas|kampinė|lov(a|os)|čiužinys|čiužiniai)\b/i, "baldai"],
  [/\b(spinta|komoda|stalas|kėdės|kėdė|lentyna|vitrina|baldai)\b/i, "baldai"],
  [
    /\b(šaldytuvas|šaldiklis|skalb(yklė|imo mašina)|džiovyklė|orkaitė|viryklė|indaplovė)\b/i,
    "stambi buitinė technika",
  ],
  [
    /\b(kapot(as|o)|bamper(is|io)|sparn(as|o)|durys|bagažinės dangtis|variklis)\b/i,
    "stambios auto dalys",
  ],
  [/\b(dvirač|bicycle|bike|e-?bike|paspirtukas|riedlentė)\b/i, "dviračiai / riedlentės"],
  [/\b(skalbimo|skalbykl|washing\s*machine|fridge|freezer|dishwasher)\b/i, "stambi technika"],
  [/\b(čiužin|matrac|sofa|couch|wardrobe|bookshelf)\b/i, "baldai"],
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function attrString(
  attrs: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!attrs) return "";
  for (const key of keys) {
    const raw = attrs[key];
    const value = Array.isArray(raw)
      ? raw.map(String).join(", ")
      : String(raw ?? "");
    const t = value.trim();
    if (t) return t;
  }
  return "";
}

function parseBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "taip"].includes(s)) return true;
  if (["false", "0", "no", "ne"].includes(s)) return false;
  return null;
}

function parseEstimatedSize(raw: unknown): OmnivaEstimatedSize | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s === "S" || s === "M" || s === "L" || s === "OVERSIZED") return s;
  return null;
}

function parseDimensionsFromText(text: string): number[] | null {
  const t = norm(text).replace(/[×✕]/g, "x");
  const m = t.match(
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*x\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*x\s*(\d{1,4}(?:[.,]\d{1,2})?)(?:\s*cm)?/
  );
  if (!m) return null;
  const nums = [m[1], m[2], m[3]]
    .map((v) => Number(String(v).replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length === 3 ? nums : null;
}

function parseWeightKgFromText(text: string): number | null {
  const t = norm(text);
  const kg = t.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*kg\b/);
  if (kg) {
    const n = Number(kg[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const g = t.match(/(\d{1,6})\s*g\b/);
  if (g) {
    const n = Number(g[1]);
    if (Number.isFinite(n) && n > 0) return n / 1000;
  }
  return null;
}

function categoryHardBlocked(category?: string): boolean {
  const c = String(category ?? "")
    .toLowerCase()
    .trim();
  if (!c) return false;
  if (HARD_BLOCK_CATEGORIES.has(c)) return true;
  // VAUTO taxonomy labels from Pass-1
  if (/^(AUTOMOBILIAI|NT|DARBAS|PASLAUGOS)$/i.test(c)) return true;
  return false;
}

function looksLikeBulky(text: string): string | null {
  const t = norm(text);
  for (const [re, reason] of BULKY_KEYWORDS) {
    if (re.test(t)) return reason;
  }
  return null;
}

function dimsExceedLocker(dims: number[]): boolean {
  const [a, b, c] = [...dims]
    .map((n) => Math.round(n * 100) / 100)
    .sort((x, y) => y - x);
  return (
    a > OMNIVA_LOCKER_MAX.lengthCm ||
    b > OMNIVA_LOCKER_MAX.widthCm ||
    c > OMNIVA_LOCKER_MAX.heightCm
  );
}

function sizeFromDims(dims: number[]): OmnivaEstimatedSize {
  if (dimsExceedLocker(dims)) return "OVERSIZED";
  const [a] = [...dims].sort((x, y) => y - x);
  if (a <= 20) return "S";
  if (a <= 40) return "M";
  return "L";
}

/**
 * Resolve whether Omniva parcel lockers may be offered for this listing.
 * Priority: hard category fence → AI fitsOmnivaLocker/estimatedSize → dims/weight → bulky keywords.
 */
export function resolveOmnivaLockerEligibility(input: {
  title?: string;
  description?: string;
  category?: string;
  attributes?: Record<string, unknown>;
  allowPastomatas?: boolean;
}): OmnivaLockerEligibility {
  const attrs = input.attributes ?? {};
  const text = [
    input.title,
    input.description,
    attrString(attrs, "deferredSalesDescription"),
    attrString(attrs, "factNotes", "ocrText", "specs"),
  ]
    .filter(Boolean)
    .map(String)
    .join(" • ");

  const vautoCat = attrString(attrs, "_vautoCategory");
  if (categoryHardBlocked(input.category) || categoryHardBlocked(vautoCat)) {
    return {
      eligible: false,
      estimatedSize: "OVERSIZED",
      fitsOmnivaLocker: false,
      reason: "kategorija netinka paštomatui",
      noteLt: OMNIVA_LOCKER_OVERSIZE_NOTE,
      defaultShipping: "pickup_or_courier",
    };
  }

  const aiFits = parseBool(attrs.fitsOmnivaLocker);
  const aiSize = parseEstimatedSize(attrs.estimatedSize);

  if (aiSize === "OVERSIZED" || aiFits === false) {
    return {
      eligible: false,
      estimatedSize: aiSize ?? "OVERSIZED",
      fitsOmnivaLocker: false,
      reason: "AI gabaritas: netelpa į Omniva L paštomatą",
      noteLt: OMNIVA_LOCKER_OVERSIZE_NOTE,
      defaultShipping: "pickup_or_courier",
    };
  }

  if (input.allowPastomatas === false) {
    return {
      eligible: false,
      estimatedSize: aiSize ?? "OVERSIZED",
      fitsOmnivaLocker: false,
      reason: "paštomatas išjungtas skelbime",
      noteLt: OMNIVA_LOCKER_OVERSIZE_NOTE,
      defaultShipping: "pickup_or_courier",
    };
  }

  const dims =
    parseDimensionsFromText(text) ||
    parseDimensionsFromText(attrString(attrs, "dimensions", "size", "matmenys"));
  if (dims && dimsExceedLocker(dims)) {
    const sorted = [...dims].sort((a, b) => b - a);
    return {
      eligible: false,
      estimatedSize: "OVERSIZED",
      fitsOmnivaLocker: false,
      reason: `matmenys ${sorted.join("×")} cm viršija ${OMNIVA_LOCKER_MAX.lengthCm}×${OMNIVA_LOCKER_MAX.widthCm}×${OMNIVA_LOCKER_MAX.heightCm} cm`,
      noteLt: OMNIVA_LOCKER_OVERSIZE_NOTE,
      defaultShipping: "pickup_or_courier",
    };
  }

  const kg =
    parseWeightKgFromText(text) ??
    parseWeightKgFromText(attrString(attrs, "weight", "svoris"));
  if (kg != null && kg > OMNIVA_LOCKER_MAX.weightKg) {
    return {
      eligible: false,
      estimatedSize: "OVERSIZED",
      fitsOmnivaLocker: false,
      reason: `svoris ${Math.round(kg * 100) / 100} kg viršija ${OMNIVA_LOCKER_MAX.weightKg} kg`,
      noteLt: OMNIVA_LOCKER_OVERSIZE_NOTE,
      defaultShipping: "pickup_or_courier",
    };
  }

  const bulky = looksLikeBulky(text);
  if (bulky) {
    return {
      eligible: false,
      estimatedSize: "OVERSIZED",
      fitsOmnivaLocker: false,
      reason: bulky,
      noteLt: OMNIVA_LOCKER_OVERSIZE_NOTE,
      defaultShipping: "pickup_or_courier",
    };
  }

  const estimatedSize: OmnivaEstimatedSize =
    aiSize ?? (dims ? sizeFromDims(dims) : "M");

  return {
    eligible: true,
    estimatedSize,
    fitsOmnivaLocker: true,
    noteLt: "",
    defaultShipping: "locker",
  };
}

/** Stamp eligibility onto draft attributes + allowPastomatas flag. */
export function applyOmnivaEligibilityToDraft<
  T extends {
    title?: string;
    description?: string;
    category?: string;
    attributes?: Record<string, string | string[] | undefined>;
    allowPastomatas?: boolean;
  },
>(
  draft: T
): T & {
  allowPastomatas: boolean;
  attributes: Record<string, string>;
} {
  const eligibility = resolveOmnivaLockerEligibility({
    title: draft.title,
    description: draft.description,
    category: draft.category,
    attributes: draft.attributes as Record<string, unknown> | undefined,
    allowPastomatas: draft.allowPastomatas,
  });
  const nextAttrs: Record<string, string> = Object.fromEntries(
    Object.entries(draft.attributes ?? {}).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.map(String).join(", ") : String(v ?? ""),
    ])
  );
  nextAttrs.fitsOmnivaLocker = eligibility.fitsOmnivaLocker ? "true" : "false";
  nextAttrs.estimatedSize = eligibility.estimatedSize;
  if (!eligibility.eligible && eligibility.reason) {
    nextAttrs.omnivaLockerBlockReason = eligibility.reason;
  } else {
    delete nextAttrs.omnivaLockerBlockReason;
  }
  return {
    ...draft,
    allowPastomatas: eligibility.eligible,
    attributes: nextAttrs,
  };
}
