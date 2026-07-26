/**
 * Chaotic / real-world input hardening — typos, slang, mixed LT/EN/RU,
 * ultra-short affirmations. Deterministic layer before Gemini.
 */

export function foldChaoticLt(raw: string): string {
  return String(raw ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/ę/g, "e")
    .replace(/ė/g, "e")
    .replace(/į/g, "i")
    .replace(/š/g, "s")
    .replace(/ų/g, "u")
    .replace(/ū/g, "u")
    .replace(/ž/g, "z")
    .replace(/[!?.,…:;]+$/g, "")
    .trim();
}

/** Common LT sell/search typos → canonical tokens (word-boundary safe). */
const TYPO_WORD_MAP: Array<[RegExp, string]> = [
  [/\bpordodu\b/g, "parduodu"],
  [/\bpardodu\b/g, "parduodu"],
  [/\bporduodu\b/g, "parduodu"],
  [/\bpardudu\b/g, "parduodu"],
  [/\bpardot\b/g, "parduoti"],
  [/\bratud\b/g, "ratus"],
  [/\bratusu\b/g, "ratus"],
  [/\bieskau\b/g, "ieskau"],
  [/\bieškau\b/g, "ieskau"],
  [/\bdrbo\b/g, "darbo"],
  [/\bdarb0\b/g, "darbo"],
  [/\bstovys\b/g, "stovis"],
  [/\bvolwo\b/g, "volvo"],
  [/\bmrecedes\b/g, "mercedes"],
  [/\biphon\b/g, "iphone"],
  // Cyrillic: JS \b is ASCII-only — use Unicode letter boundaries.
  [/(?<!\p{L})продаю(?!\p{L})/gu, "parduodu"],
  [/(?<!\p{L})продам(?!\p{L})/gu, "parduodu"],
  [/(?<!\p{L})ищу(?!\p{L})/gu, "ieskau"],
  [/(?<!\p{L})работу(?!\p{L})/gu, "darbo"],
  [/(?<!\p{L})работа(?!\p{L})/gu, "darbo"],
  [/\bselling\b/g, "parduodu"],
  [/\bsell\b/g, "parduodu"],
  [/\blooking\s+for\s+job\b/g, "ieskau darbo"],
];

/**
 * Normalize chaotic user text for deterministic intent matchers.
 * Preserves meaning; does not invent product facts.
 */
export function normalizeChaoticUserText(raw: string): string {
  let t = foldChaoticLt(raw);
  if (!t) return "";
  // Strip common emoji wrappers but keep bare emoji for affirmation detection elsewhere.
  t = t.replace(/[\u{1F300}-\u{1FAFF}]/gu, " ").replace(/\s+/g, " ").trim();
  for (const [re, repl] of TYPO_WORD_MAP) {
    t = t.replace(re, repl);
  }
  return t.replace(/\s+/g, " ").trim();
}

/** Sell intent with typo/RU/EN tolerance (deterministic). */
export function hasChaoticSellIntent(raw: string): boolean {
  const t = normalizeChaoticUserText(raw);
  if (!t) return false;
  if (
    /\b(parduodu|parduosiu|parduoti|parduot|продаю|продам|selling?)\b/.test(t)
  ) {
    return true;
  }
  if (/\bnoriu\s+parduot/.test(t) || /\bpad[eе]k\s+parduot/.test(t)) return true;
  if (/\b(ikelti|ideti|kelti)\s+skelb/.test(t)) return true;
  if (/\bsiulau\s+(darb|paslaug)/.test(t) || /\bteikiu\s+paslaug/.test(t)) {
    return true;
  }
  // Typos that map to sell + product: "pordodu ratud r16"
  if (/\bratus\b/.test(t) && /\br ?1[45678]\b|\b\d{2,3}\s*cm\b/.test(t)) {
    return true;
  }
  return false;
}

/** Job-seeker create intent with typos (“ieskau drbo”). */
export function hasChaoticJobSeekerCreateIntent(raw: string): boolean {
  const t = normalizeChaoticUserText(raw);
  if (!t) return false;
  if (/\b(darbo\s+ked|darbo\s+stal|office\s+chair)\b/.test(t)) return false;
  return (
    /\bieskau\s+darbo\b/.test(t) ||
    /\blooking\s+for\s+(a\s+)?job\b/.test(t) ||
    /ищу\s+работ/u.test(foldChaoticLt(raw))
  );
}

/**
 * Ultra-short affirmations that confirm the current flow state.
 * Must NEVER reset the session or trigger browse-all.
 */
const ULTRA_SHORT_CONFIRM_EXACT = new Set([
  "ok",
  "okay",
  "okej",
  "okei",
  "okk",
  "nu",
  "nuu",
  "taip",
  "ajo",
  "ajojo",
  "gerai",
  "gera",
  "tinka",
  "viskas",
  "jo",
  "joo",
  "yep",
  "yes",
  "yeah",
  "да",
  "ок",
  "хорошо",
  "ладно",
  "👍",
  "👌",
  "✅",
  "👍🏻",
  "👍🏼",
  "👍🏽",
  "👍🏾",
  "👍🏿",
]);

export function isUltraShortConfirmation(raw: string): boolean {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return false;
  // Bare emoji thumbs-up / check (with optional variation selectors / ZWJ skin tones).
  if (/^(👍|👌|✅|✔️|☑️)([\uFE0F\uFE0E]|[\u{1F3FB}-\u{1F3FF}])?$/u.test(trimmed)) {
    return true;
  }
  const folded = foldChaoticLt(trimmed);
  if (ULTRA_SHORT_CONFIRM_EXACT.has(folded)) return true;
  if (ULTRA_SHORT_CONFIRM_EXACT.has(trimmed.toLowerCase())) return true;
  // "ok.", "nu!", "taip..."
  if (/^(ok|okay|nu|taip|gerai|tinka|jo|yep|yes|да|ок)[.!…]*$/i.test(folded)) {
    return true;
  }
  return false;
}

/** Heuristic category families for vision↔text conflict detection. */
export type ChaoticCategoryFamily =
  | "footwear"
  | "clothing"
  | "vehicles"
  | "services"
  | "jobs"
  | "real_estate"
  | "electronics"
  | "home"
  | "other";

const FAMILY_HINTS: Array<{ family: ChaoticCategoryFamily; re: RegExp }> = [
  {
    family: "footwear",
    re: /\b(bat|ked|sneaker|shoe|кроссов|туфл|ботин)/i,
  },
  {
    family: "clothing",
    re: /\b(suknel|drabuz|rub|striuk|keln|marsk|dress|jacket|одежд|плать)/i,
  },
  {
    family: "vehicles",
    re: /\b(auto|volvo|bmw|audi|citroen|ratas|ratus|r\s*1[45678]|шина|авто|машин)/i,
  },
  {
    family: "services",
    re: /\b(stog|remont|paslaug|montuo|valau|roof|service|услуг|ремонт)/i,
  },
  {
    family: "jobs",
    re: /\b(darbo|darbuotoj|job|vacanc|работ)/i,
  },
  {
    family: "real_estate",
    re: /\b(butas|namas|nt\b|kambar|квартир|дом)/i,
  },
  {
    family: "electronics",
    re: /\b(iphone|samsung|telefon|laptop|tv\b|телефон|ноут)/i,
  },
  {
    family: "home",
    re: /\b(sofa|bald|stalas|kede|мебел)/i,
  },
];

export function inferChaoticCategoryFamily(
  text: string
): ChaoticCategoryFamily | null {
  const t = String(text ?? "");
  if (!t.trim()) return null;
  for (const { family, re } of FAMILY_HINTS) {
    if (re.test(t)) return family;
  }
  return null;
}

/**
 * True when user text category family clearly conflicts with vision family
 * (e.g. shoe photo + roofing services caption).
 */
export function hasVisionTextCategoryConflict(
  visionHint: string | undefined,
  userText: string | undefined
): boolean {
  const v = inferChaoticCategoryFamily(String(visionHint ?? ""));
  const u = inferChaoticCategoryFamily(String(userText ?? ""));
  if (!v || !u) return false;
  if (v === u) return false;
  // Soft pairs that often co-occur
  if (
    (v === "clothing" && u === "footwear") ||
    (v === "footwear" && u === "clothing")
  ) {
    return false;
  }
  return true;
}

export function buildVisionTextConflictPrompt(
  visionFamily: ChaoticCategoryFamily,
  textFamily: ChaoticCategoryFamily
): string {
  const labels: Record<ChaoticCategoryFamily, string> = {
    footwear: "batai / avalynė",
    clothing: "drabužiai",
    vehicles: "transportas / auto",
    services: "paslaugos",
    jobs: "darbas",
    real_estate: "NT",
    electronics: "elektronika",
    home: "namai / baldai",
    other: "kita",
  };
  return (
    `Matau konfliktą: nuotrauka labiau panaši į „${labels[visionFamily]}“, ` +
    `o tekstas — į „${labels[textFamily]}“. Kurį skelbimą ruošiame?`
  );
}
