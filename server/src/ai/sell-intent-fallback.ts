/**
 * Server-side sell-intent heuristics — mirrors client scoring for fallback drafts (S0.9).
 * NEVER echo the user's raw sentence as title/description.
 * Sparse sell text ("noriu parduoti citroen") → clarify, do NOT invent a draft.
 */
import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import { buildLeanSellGreeting } from "../shared/listing-organism.js";
import {
  hasChaoticJobSeekerCreateIntent,
  hasChaoticSellIntent,
  normalizeChaoticUserText,
} from "../shared/chaotic-input.js";
import { parsePriceFromChatInput } from "./listing-chat-input.js";
import {
  extractLtCityNominativeFromText,
  isKnownLtCityToken,
} from "./lithuanian-location-normalize.js";
import { cityInLocative } from "../shared/vehicle-sales-copy.js";

/** Country-only / empty city → leave empty (user or GPS fills later). Never invent Vilnius. */
function sanitizeFallbackListingCity(raw?: string | null): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const n = v
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(lietuva|lithuania|lt|ltu|visa lietuva|all lithuania|nationwide|nezinoma lokacija|nežinoma lokacija)$/i.test(
      n
    )
  ) {
    return "";
  }
  return v;
}

const SELL_PATTERNS = [
  /\bparduodu\b/i,
  /\bparduosiu\b/i,
  /\bnoriu\s+parduot/i,
  /\bnor[eė]čiau\s+parduot/i,
  /\bnoreciau\s+parduot/i,
  /\bpad[eė]k\s+parduot/i,
  /\bpadek\s+parduot/i,
  /\bįdėti\s+skelb/i,
  /\bideti\s+skelb/i,
  /\bnoriu\s+parduoti\b/i,
  /\b(tiesiog\s+)?noriu\s+(į|i)?kelti\s+skelb/i,
  /\b(tiesiog\s+)?noriu\s+(į|i)?dėti\s+skelb/i,
  /\b(į|i)kelti\s+skelbim/i,
  /\bieškau\s+darbo\b/i,
  /\bieskau\s+darbo\b/i,
  /\bsiūlau\s+(darb|paslaug)/i,
  /\bsiulau\s+(darb|paslaug)/i,
  /\bteikiu\s+paslaug/i,
  // P0 — natural service/job phrases: „siūlau buto valymo paslaugas“,
  // „teikiu automobilių remonto paslaugas“.
  /\bsiūlau\s+[\p{L}\s]{0,40}?paslaug/iu,
  /\bsiulau\s+[\p{L}\s]{0,40}?paslaug/iu,
  /\bteikiu\s+[\p{L}\s]{0,40}?paslaug/iu,
  // P0 — „ieškome vyresniojo buhalterio“, „reikalingas C kategorijos vairuotojas“.
  /\bie[šs]kom(?:e|as)?\b[\p{L}\s]{0,40}?\b(pardav[eė]j|vairuotoj|buhalter|kasinink|vir[eė]j|inžinier|vadybinink|specialist|darbuotoj|apskait)\p{L}*\b/iu,
  /\breikaling(?:as|a|i)?\b[\p{L}\s]{0,40}?\b(pardav[eė]j|vairuotoj|buhalter|kasinink|vir[eė]j|inžinier|vadybinink|specialist|darbuotoj|apskait)\p{L}*\b/iu,
  /\bsusikaupe\b.*\b(rub|drabuž|drabuz)/i,
  /\bdaug\s+(rub|drabuž|drabuz)/i,
  /\b(atlaisvin|išvalau|isvalau)\s+spint/i,
];

const BUY_PATTERNS = [
  /\bnoriu\s+pirkti\b/i,
  /\bnoreciau\s+pirkti\b/i,
  /\bieškau\b/i,
  /\bieskau\b/i,
  /\bparodyk\b/i,
];

const CLOTHING_HINT = /\b(drabuž|rub|sukn|bat|batus|batel|ked|keln|striuk|spint|megz|maršk|gryb)/i;
const HOME_ART_HINT =
  /\b(paveiksl|tapyb|drob|skulptūr|skulptur|dekor|bald|sofa|stal|kėd|kedes|lentyn|kilim|vaz|veidrod|interjer)/i;
const ELECTRONICS_HINT =
  /\b(iphone|samsung|telefon|laptop|kompiuter|elektron|televiz|planšet|planšet|ausin|konsol)/i;

const AUTO_BRANDS: { pattern: RegExp; make: string }[] = [
  { pattern: /citro[eë]?n/i, make: "Citroën" },
  { pattern: /\bpeugeot\b/i, make: "Peugeot" },
  { pattern: /\bbmw\b/i, make: "BMW" },
  { pattern: /\bvolkswagen\b|\bvw\b/i, make: "Volkswagen" },
  { pattern: /\btoyota\b/i, make: "Toyota" },
  { pattern: /\bmercedes\b/i, make: "Mercedes-Benz" },
  { pattern: /\baudi\b/i, make: "Audi" },
  { pattern: /\bopel\b/i, make: "Opel" },
  { pattern: /\bford\b/i, make: "Ford" },
  { pattern: /\brenault\b/i, make: "Renault" },
  { pattern: /\bskoda\b/i, make: "Škoda" },
  { pattern: /\bvolvo\b/i, make: "Volvo" },
];

/** Model / year / mileage / engine signals that make a sell note "enough" to draft. */
const SPEC_SIGNAL =
  /\b(c[1-5]\b|berlingo|cactus|picasso|jumpy|spacetourer|xsara|saxo|ds[3-7]|\d{4}\s*m\.?|\b(19|20)\d{2}\b|\b\d{1,3}[\s.]?\d{3}\s*km\b|\b\d{2,4}\s*k[wv]\b|\b\d[.,]\d\s*(?:l|ltr|litrai?)\b|benzinas|dyzel|dizel|elektr|hibrid|automat|mechanin)/i;

export function detectServerSellIntent(text: string): boolean {
  const raw = text.trim();
  if (!raw || raw.length < 4) return false;
  const q = normalizeChaoticUserText(raw) || raw.toLowerCase();
  // Job/service create phrases must win over bare „ieškau…“ buyer gate.
  if (
    hasChaoticJobSeekerCreateIntent(raw) ||
    /\bieškau\s+darbo\b/i.test(q) ||
    /\bieskau\s+darbo\b/i.test(q) ||
    /\b(tiesiog\s+)?noriu\s+(į|i)?kelti\s+skelb/i.test(q) ||
    /\b(į|i)kelti\s+skelbim/i.test(q)
  ) {
    return true;
  }
  if (hasChaoticSellIntent(raw)) return true;
  if (BUY_PATTERNS.some((re) => re.test(q))) return false;
  return SELL_PATTERNS.some((re) => re.test(q));
}

export function inferMake(text: string): string {
  for (const { pattern, make } of AUTO_BRANDS) {
    if (pattern.test(text)) return make;
  }
  return "";
}

/** Job-seeker listing create (“Ieškau darbo…”) — always text-first soft draft. */
export function isJobSeekerListingCreateIntent(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return false;
  if (/\b(darbo\s+kėd|darbo\s+ked|darbo\s+stal|office\s+chair)\b/i.test(q)) {
    return false;
  }
  if (hasChaoticJobSeekerCreateIntent(text)) return true;
  return /\bieškau\s+darbo\b/i.test(q) || /\bieskau\s+darbo\b/i.test(q);
}

/**
 * Sparse = sell intent without photos/specs (e.g. "noriu parduoti citroen").
 * Must NOT invent a placeholder listing draft.
 */
export function isSparseSellRequest(text: string): boolean {
  if (!detectServerSellIntent(text)) return false;
  const t = text.trim();
  // Job-seeker create is always soft-skeleton (never catalog search).
  if (isJobSeekerListingCreateIntent(t)) return true;
  if (SPEC_SIGNAL.test(t)) return false;
  // Brand-only or generic sell phrase without model/year/km/engine.
  const withoutSell = t
    .replace(/\b(parduodu|parduosiu|noriu\s+parduoti?|nor[eė]čiau\s+parduoti?|pad[eė]k\s+parduoti?)\b/gi, " ")
    .replace(/\bieškau\s+darbo\b/gi, " ")
    .replace(/\bieskau\s+darbo\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutSell.length < 3) return true;
  const make = inferMake(t);
  if (make) {
    // "citroen" / "citroena" alone after stripping sell words → sparse
    const rest = withoutSell
      .replace(/citro[eë]?n\w*/gi, "")
      .replace(new RegExp(make.replace("-", "[-\\s]?"), "ig"), "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return rest.length < 2;
  }
  return withoutSell.length < 18;
}

const INTERNAL_TO_VAUTO_CATEGORY: Record<string, string> = {
  vehicles: "AUTOMOBILIAI",
  transport: "TRANSPORTAS",
  real_estate: "NT",
  electronics: "ELEKTRONIKA",
  jobs: "DARBAS",
  home: "NAMAI",
  clothing: "APRANGA",
  services: "PASLAUGOS",
  tools: "IRANKIAI",
  rental: "NUOMA",
  other: "KITA",
};

function buildCategoryAwareSellGreeting(
  _text: string,
  category: string,
  _make: string
): string {
  void _text;
  void _make;
  return buildLeanSellGreeting(category);
}

export function buildSellClarificationReply(
  text: string,
  opts?: { userCity?: string; contact?: string }
): {
  reply: string;
  quickReplies: string[];
  action: {
    type: "listing_draft";
    listingDraft: {
      title: string;
      description: string;
      price: number;
      location: string;
      contact: string;
      category: string;
      confidence: number;
      attributes: Record<string, string>;
      listingFlowState: "DRAFTING_TEXT";
    };
  };
} {
  const make = inferMake(text);
  const category = inferCategory(text);
  const title = make ? `Parduodamas ${make}` : inferTitle(text, category, make);
  // Soft skeleton keeps sell_intent session alive — empty description, no fake fluff.
  const listingDraft = {
    title,
    description: "",
    price: 0,
    location: sanitizeFallbackListingCity(opts?.userCity),
    contact: opts?.contact?.trim() || "",
    category,
    confidence: 0.45,
    attributes: {
      ...(make ? { make } : {}),
      sellIntentActive: "true",
      awaitingSpecs: "true",
      _vautoCategory: INTERNAL_TO_VAUTO_CATEGORY[category] ?? "KITA",
    },
    listingFlowState: "DRAFTING_TEXT" as const,
  };
  return {
    reply: buildCategoryAwareSellGreeting(text, category, make),
    quickReplies: [],
    action: { type: "listing_draft", listingDraft },
  };
}

function inferCategory(text: string): string {
  // Non-vehicle categories first — avoid auto bias on "parduoti paveikslą".
  if (HOME_ART_HINT.test(text)) return "home";
  if (CLOTHING_HINT.test(text)) return "clothing";
  if (ELECTRONICS_HINT.test(text)) return "electronics";
  if (/\b(butas|namas|nt|kambar|sklyp)/i.test(text)) return "real_estate";
  if (/\b(nuomuoju|nuoma|nuomoti)\b/i.test(text)) return "rental";
  // Wheels/parts before brand→vehicles (Citroën logo on rims ≠ full car).
  if (
    /\b(ratlank|ratai|ratus|padang|dis[kc]ai|dalys|bamper|kapot|žibint|zibint|r1[4-9]|ratud)\b/i.test(
      text
    )
  ) {
    return "tools";
  }
  if (/\b(įrank|irank|gręžtuv|generator)/i.test(text)) return "tools";
  if (/\b(paslaug|remont|valym)/i.test(text)) return "services";
  if (
    /\b(darbas|darbą|darbo|ieškau\s+darbo|ieskau\s+darbo|vakans)\b/i.test(text) ||
    /\b(pardav[eė]j|vairuotoj|buhalter|kasinink|vir[eė]j|inžinier|vadybinink|specialist|darbuotoj|apskait)\p{L}*\b/iu.test(text)
  ) {
    return "jobs";
  }
  if (inferMake(text) || /\b(bmw|audi|volvo|mercedes|auto|mašin|masin|citro|automobil)/i.test(text)) {
    return "vehicles";
  }
  if (/\b(motocikl|priekab|sunkvež|dvirač|transport)/i.test(text)) {
    return "transport";
  }
  return "other";
}

const SELL_VERB_TOKENS = new Set([
  "parduodu",
  "parduosiu",
  "siūlau",
  "siulau",
  "teikiu",
  "noriu",
  "norėčiau",
  "norėciau",
  "parduoti",
  "ieškau",
  "ieskau",
  "ieškome",
  "ieškom",
  "reikalingas",
  "reikalinga",
]);

// P0 — condition/color fillers are stripped ONLY when the source token is
// fully lowercase. Capitalized brand words (New Balance, Galaxy S…) are
// human text authority and stay untouched.
const CONDITION_TOKENS = new Set([
  "naują", "nauja", "naujas", "nauji", "naujų",
  "naudotą", "naudota", "naudotas", "naudoti",
  "dėvėtą", "dėvėta", "seną", "sena", "senas", "seni",
]);

const COLOR_TOKENS = new Set([
  "juodą", "juoda", "juodas", "juodi", "juodos",
  "baltą", "balta", "baltas",
  "mėlyną", "mėlyna", "mėlynas",
  "raudoną", "raudona", "raudonas",
  "žalią", "žalia", "žalias",
  "pilką", "pilka", "pilkas",
  "rudą", "ruda", "rudas",
  "geltoną", "geltona", "geltonas",
  "oranžinę", "oranžinė",
]);

const SIZE_WORD_TOKENS = new Set(["dydžio", "dydis", "dydį"]);
const SIZE_LETTER_TOKEN_RE = /^(xs|s|m|l|xl|xxl|xxxl)$/i;

const PRICE_KEYWORD_TOKENS = new Set(["kaina", "už", "uz", "atlyginimas", "alga", "po"]);

const NUMERIC_TOKEN_RE = /^\d[\d.,\s-]*$/;
const CURRENCY_TOKEN_RE = /^(eur[\p{L}]*|€)$/iu;

interface TitleToken {
  lower: string;
  /** Source-cased form — brands keep their capitalization. */
  original: string;
  hasUpper: boolean;
}

function tokenizeTitleText(text: string): TitleToken[] {
  return String(text ?? "")
    // P0 — an area construction („85 m²“) is an attribute, never a title part.
    .replace(/\d+[\s.,]?m\s*²/giu, " ")
    .replace(/[^\p{L}\p{N}\s&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((t) => ({
      lower: t.toLowerCase(),
      original: t,
      hasUpper: /[A-ZĄČĘĖĮŠŲŪŽ]/.test(t),
    }));
}

/**
 * P0 — price words are removed ONLY together with a clearly recognized price
 * construction (keyword + numeric [+ currency]). A lone „po“/„už“/„kaina“
 * without an adjacent numeric price never removes anything else. No ASCII-\b
 * word boundaries (Lithuanian diacritics are not word chars for JS \b /u-less).
 */
function stripPriceTokens(tokens: TitleToken[]): TitleToken[] {
  const out: TitleToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (PRICE_KEYWORD_TOKENS.has(t.lower)) {
      const next = tokens[i + 1];
      if (next != null && NUMERIC_TOKEN_RE.test(next.lower)) {
        i++; // keyword
        i++; // number
        if (tokens[i] != null && CURRENCY_TOKEN_RE.test(tokens[i]!.lower)) i++;
        i--;
        continue;
      }
      out.push(t);
      continue;
    }
    const next = tokens[i + 1];
    if (NUMERIC_TOKEN_RE.test(t.lower) && next != null && CURRENCY_TOKEN_RE.test(next.lower)) {
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * P0 — the ONLY noun forms this engine may touch: a documented whitelist of
 * common Lithuanian object/role nouns (accusative/instrumental/genitive →
 * nominative). NO general morphology is applied to unknown words — lowercase
 * spelling does not prove a word is a Lithuanian common noun, so anything
 * outside this list keeps the user's original form (slightly imperfect
 * grammar beats altering a user fact or product name).
 */
const NARROW_NOUN_NOMINATIVE: Record<string, string> = {
  striukę: "striukė",
  suknelę: "suknelė",
  dviratuką: "dviratukas",
  stalą: "stalas",
  butą: "butas",
  krepšį: "krepšis",
  lentyną: "lentyna",
  prekes: "prekės",
  telefoną: "telefonas",
  planšetę: "planšetė",
  konsolę: "konsolė",
  droną: "dronas",
  grąžtą: "grąžtas",
  adapterį: "adapteris",
  automobilį: "automobilis",
  batus: "batai",
  ausines: "ausinės",
  pardavėju: "pardavėjas",
  pardavėjui: "pardavėjas",
  buhalterio: "buhalteris",
  kasininku: "kasininkas",
  virėju: "virėjas",
};

function nounNominativeSafe(tok: string): string {
  return NARROW_NOUN_NOMINATIVE[tok] ?? tok;
}

/**
 * P0 — the ONLY adjective forms this engine may touch: a documented, narrow
 * set of common Lithuanian descriptive adjectives (accusative → nominative).
 * No broad gender-driven inflection of arbitrary words.
 */
const NARROW_ADJECTIVE_NOMINATIVE: Record<string, string> = {
  "moterišką": "moteriška",
  "odinę": "odinė",
  "ąžuolinį": "ąžuolinis",
  "vaikišką": "vaikiškas",
  "medinę": "medinė",
  "stiklinį": "stiklinis",
};

function nominativizeNounPhrase(tokens: TitleToken[]): string[] {
  if (!tokens.length) return [];
  // P0 — every fully-lowercase token may ONLY come from the documented
  // whitelists (narrow adjectives / narrow nouns). Anything else — brands,
  // models, acronyms, foreign words — keeps the user's original form.
  return tokens.map((tok) => {
    if (tok.hasUpper) return tok.original;
    return (
      NARROW_ADJECTIVE_NOMINATIVE[tok.lower] ?? nounNominativeSafe(tok.lower)
    );
  });
}

function capitalizeFirst(value: string): string {
  const t = value.trim();
  if (!t) return t;
  // Keep already-capitalized brand starts intact („iPad“ must not become „IPad“).
  if (/^[A-ZĄČĘĖĮŠŲŪŽ]/.test(t)) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function colorNomNative(token: string): string {
  const n = token.endsWith("ą") ? `${token.slice(0, -1)}a` : token;
  return capitalizeFirst(n);
}

function vehicleModelFromText(text: string, make: string): string {
  const escaped = make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b${escaped}\\s+([\\p{L}\\p{N}.]+)`, "iu").exec(text);
  return m?.[1] ?? "";
}

function extractYearFromText(text: string): string {
  return /\b(?:19|20)\d{2}\b/.exec(text)?.[0] ?? "";
}

/** Job-role lexemes for title synthesis (narrow, documented). */
const JOB_ROLE_TOKEN_RE =
  /^(pardav[eė]j\p{L}*|vairuotoj\p{L}*|buhalter\p{L}*|kasinink\p{L}*|vir[eė]j\p{L}*|inžinier\p{L}*|vadybinink\p{L}*|specialist\p{L}*|darbuotoj\p{L}*|apskait\p{L}*)$/iu;

/**
 * P0 — deterministic title synthesis from the CURRENT user text. The title is
 * a SHORT product/object name. Human text is the highest authority: only
 * narrowly-tested Lithuanian filler/ending patterns are applied; brands and
 * models are preserved token-for-token.
 */
function inferTitle(text: string, category: string, make: string): string {
  if (category === "vehicles" && make) {
    const model = vehicleModelFromText(text, make);
    const year = extractYearFromText(text);
    const parts = [make, model, year].filter(Boolean);
    return parts.length > 1 ? parts.join(" ") : `Parduodamas ${make}`;
  }

  if (category === "electronics") {
    const m = /\biphone\s+(\d+)\s*(pro|max|mini|plus)?(?:\s+(\d+)\s*gb)?/i.exec(text);
    if (m) {
      const variant = m[2] ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : "";
      const gb = m[3] ? `${m[3]} GB` : "";
      return ["iPhone", m[1], variant, gb].filter(Boolean).join(" ");
    }
  }

  const tokens = stripPriceTokens(tokenizeTitleText(text));

  if (category === "jobs") {
    const role = tokens.find((t) => JOB_ROLE_TOKEN_RE.test(t.lower));
    if (role) return capitalizeFirst(nounNominativeSafe(role.lower));
    return "Darbo pasiūlymas";
  }

  if (category === "services") {
    const idx = tokens.findIndex((t) => /^paslaug/.test(t.lower));
    if (idx >= 0) {
      const after: string[] = [];
      for (const t of tokens.slice(idx + 1)) {
        if (isKnownLtCityToken(t.lower)) break;
        after.push(t.hasUpper ? t.original : t.lower);
      }
      if (after.length) return capitalizeFirst(after.join(" "));
      // „buto valymo paslaugas“ — the name precedes the service word.
      const before: string[] = [];
      for (const t of tokens.slice(0, idx)) {
        if (SELL_VERB_TOKENS.has(t.lower)) continue;
        if (isKnownLtCityToken(t.lower)) continue;
        before.push(t.hasUpper ? t.original : t.lower);
      }
      if (before.length) {
        return capitalizeFirst([...before, "paslaugos"].join(" "));
      }
    }
  }

  // Size construction cleanup FIRST („M dydžio“): the letter + the size word
  // form a recognized pair and are removed together. A bare size letter NOT
  // adjacent to a size word (brand/model „S“, „M4“) is preserved.
  const sizeCleaned: TitleToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = tokens[i + 1];
    if (
      next != null &&
      SIZE_WORD_TOKENS.has(next.lower) &&
      SIZE_LETTER_TOKEN_RE.test(t.lower)
    ) {
      i++;
      continue;
    }
    if (SIZE_WORD_TOKENS.has(t.lower)) continue;
    sizeCleaned.push(t);
  }

  // P0 — price keywords are removed ONLY by the price-construction-aware
  // stripPriceTokens above; this filter never deletes them again (a lone
  // „po“/„už“ must survive here).
  const phrase = sizeCleaned.filter(
    (t) =>
      !SELL_VERB_TOKENS.has(t.lower) &&
      !(CONDITION_TOKENS.has(t.lower) && !t.hasUpper) &&
      !(COLOR_TOKENS.has(t.lower) && !t.hasUpper) &&
      !isKnownLtCityToken(t.lower) &&
      !CURRENCY_TOKEN_RE.test(t.lower)
  );
  const normalized = nominativizeNounPhrase(phrase);
  if (normalized.length) return capitalizeFirst(normalized.join(" "));

  if (category === "vehicles") return "Parduodamas automobilis";
  if (category === "clothing") return "Parduodamas drabužis";
  if (category === "electronics") return "Parduodama elektronika";
  if (category === "home") {
    if (/\bpaveiksl/i.test(text)) return "Paveikslas";
    if (/\bbald/i.test(text)) return "Baldai";
    return "Namų prekė";
  }
  return "Naujas skelbimas";
}

function buildFallbackDescription(input: {
  title: string;
  category: string;
  make: string;
  location: string;
}): string {
  const subject = input.make || input.title;
  const city = input.location?.trim() || "";
  if (input.category === "vehicles" || input.make) {
    const makeLabel = input.make || "automobilis";
    // Natural LT — nominative fuel/body filled later from vision; city in locative when known.
    const cityLine = city
      ? `Automobilis stovi ${cityInLocative(city)}.`
      : "";
    return [
      `Parduodamas naudotas automobilis ${makeLabel}.`,
      "Techniniai duomenys (metai, dyzelinis / benzininis variklis, kW, rida, kėbulo tipas) bus patikslinti pagal tech passport ir nuotraukas.",
      cityLine,
      "Dėl apžiūros kreipkitės nurodytu telefonu.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `${subject}: konkretūs parametrai pagal jūsų detales ir nuotraukas.`,
    "Be marketinginių frazių — tik faktinė informacija skelbimui.",
  ].join(" ");
}

export interface SellDraftFallback {
  reply: string;
  quickReplies?: string[];
  action: {
    type: "listing_draft";
    listingDraft: {
      title: string;
      description: string;
      price: number;
      location: string;
      contact: string;
      category: string;
      confidence: number;
      attributes: Record<string, string>;
    };
  };
}

/** Pull a EUR price from free-text sell notes (e.g. "už 4500", "4500€", "r17 150€"). */
export function extractPriceFromSellText(text: string): number {
  // Hardened parser — rim sizes (R17) must never concatenate into price.
  const n = parsePriceFromChatInput(String(text ?? ""));
  return n != null && n > 0 ? n : 0;
}

/**
 * Schema-compatible JSON when Gemini vision hits 429 / RESOURCE_EXHAUSTED.
 * Uses only user text + optional price — no image tokens.
 */
export function buildVisionQuotaTextFallbackJson(input: {
  userText?: string;
  userCity?: string;
  priceHint?: number;
}): Record<string, unknown> {
  const text = String(input.userText ?? "").trim() || "Noriu parduoti";
  // Sparse text alone must not invent a rich fake listing under quota pressure either.
  if (isSparseSellRequest(text)) {
    const clarify = buildSellClarificationReply(text);
    const sparseCategory =
      INTERNAL_TO_VAUTO_CATEGORY[clarify.action.listingDraft.category] ?? "KITA";
    return {
      intent: "sell",
      category: sparseCategory,
      title: clarify.action.listingDraft.title || "Skelbimas",
      price: null,
      city: input.userCity || "Lietuva",
      description: clarify.reply,
      technicalFields: {
        visionQuotaFallback: "true",
        needsClarification: "true",
        sparseSell: "true",
      },
      attributes: {
        visionQuotaFallback: "true",
        needsClarification: "true",
        sparseSell: "true",
      },
      confidence: 0.2,
      sceneContext: "sparse_sell_clarify",
      detectedObjects: [],
      choiceChips: clarify.quickReplies,
      documentReadable: false,
    };
  }
  const draft = buildSellListingDraftFallback(text, {
    userCity: input.userCity,
  }).action.listingDraft;
  const price =
    (input.priceHint && input.priceHint > 0
      ? input.priceHint
      : extractPriceFromSellText(text)) || draft.price || 0;
  const categoryKey =
    INTERNAL_TO_VAUTO_CATEGORY[draft.category] ?? "KITA";
  const priceLine =
    price > 0
      ? `Prašoma kaina: ${price} €.`
      : "Kainą galite nurodyti kitame žingsnyje.";
  const isVehicleDraft =
    draft.category === "vehicles" || draft.category === "transport";
  const description = [
    draft.description,
    isVehicleDraft
      ? "Nuotraukos išsaugotos. Dokumentų (tech passport) vaizdai naudojami tik specs — viešoje galerijoje nerodomi."
      : "Nuotraukos išsaugotos — papildykite aprašymą ar kainą pokalbyje.",
    isVehicleDraft
      ? "AI vaizdo analizė laikinai nepasiekiama — aprašymas sudarytas pagal jūsų tekstą; papildykite metus, ridą, variklį prieš skelbiant."
      : "AI vaizdo analizė laikinai nepasiekiama — aprašymas sudarytas pagal jūsų tekstą; papildykite detales prieš skelbiant.",
    priceLine,
  ].join(" ");

  return {
    intent: "sell",
    category: categoryKey,
    title: draft.title,
    price: price > 0 ? price : null,
    city: draft.location || input.userCity || "Lietuva",
    description,
    technicalFields: {
      ...draft.attributes,
      visionQuotaFallback: "true",
    },
    attributes: {
      ...draft.attributes,
      visionQuotaFallback: "true",
    },
    confidence: 0.7,
    sceneContext: "text_fallback_quota",
    detectedObjects: [],
    choiceChips: [],
  };
}

/** P0 — ASCII-\b cannot see the Lithuanian „ą“/„a“ word tail; use a word-tail
 *  boundary that respects non-ASCII letters (JS without /u treats them as
 *  non-word characters). Capitalized brand words („New Balance“) are human
 *  text authority and are NEVER read as a condition. */
const WORD_TAIL = /(?=$|[\s,;.!?—–-])/u;
const NO_CAPITAL_BEFORE = /(?<![A-ZĄČĘĖĮŠŲŪŽ])/u;

function hasExplicitNewConditionInText(text: string): boolean {
  return new RegExp(
    `${NO_CAPITAL_BEFORE.source}\\b(nauj[aą]|new)${WORD_TAIL.source}`,
    "i"
  ).test(text);
}

function hasExplicitUsedConditionInText(text: string): boolean {
  return new RegExp(
    `${NO_CAPITAL_BEFORE.source}\\b(naudot[aą]?|used)${WORD_TAIL.source}`,
    "i"
  ).test(text);
}

function hasExplicitConditionInText(text: string): boolean {
  return (
    hasExplicitNewConditionInText(text) ||
    hasExplicitUsedConditionInText(text)
  );
}

/**
 * Build a draft ONLY when the sell note already has usable specs.
 * Prefer buildSellClarificationReply for sparse text.
 */
export function buildSellListingDraftFallback(
  text: string,
  ctx: { userCity?: string; contact?: string }
): SellDraftFallback {
  const category = inferCategory(text);
  const make = inferMake(text);
  const title = inferTitle(text, category, make) || "Naujas skelbimas";
  // P0 — the current user text is the single fact authority: the city the
  // user wrote (in any case form) wins over the profile fallback.
  const location =
    extractLtCityNominativeFromText(text)?.trim() ||
    sanitizeFallbackListingCity(ctx.userCity) ||
    "";
  const attributes: Record<string, string> = {};
  if (make) {
    attributes.make = make;
  }
  // P0 — deterministic category facts from the CURRENT text. Only facts the
  // text actually states are extracted; anything the deterministic engine
  // cannot reasonably infer stays MISSING (tests must mark it explicitly).
  if (category === "vehicles") {
    if (make) {
      const model = vehicleModelFromText(text, make);
      if (model) attributes.model = model;
      const year = extractYearFromText(text);
      if (year) attributes.year = year;
    }
  } else if (category === "real_estate") {
    const rooms = /(\d+)\s*kambari/iu.exec(text)?.[1];
    if (rooms) attributes.rooms = rooms;
    if (/\bsklyp/iu.test(text)) attributes.propertyType = "Sklypas";
    else if (/\bnam/iu.test(text)) attributes.propertyType = "Namas";
    else if (/\bbut/iu.test(text)) attributes.propertyType = "Butas";
  } else if (category === "electronics") {
    const iphone = /\biphone\s+(\d+)\s*(pro|max|mini|plus)?(?:\s+(\d+)\s*gb)?/iu.exec(text);
    if (iphone) {
      attributes.deviceModel = `iPhone ${iphone[1]}${iphone[2] ? ` ${iphone[2].charAt(0).toUpperCase()}${iphone[2].slice(1)}` : ""}`.trim();
      if (iphone[3]) attributes.storage = `${iphone[3]} GB`;
    }
    const color = [...COLOR_TOKENS].find((c) => text.toLowerCase().includes(c));
    if (color) attributes.color = colorNomNative(color);
  } else if (category === "clothing") {
    if (/\b(bat|ked|aul)/iu.test(text)) {
      attributes.fashionCategory = "Moterims › Bateliai";
      attributes.clothingType = "Bateliai";
    } else if (/\bstriuk/iu.test(text)) {
      attributes.fashionCategory = "Moterims › Viršutiniai drabužiai";
      attributes.clothingType = "Striukės";
    } else {
      attributes.fashionCategory = "Moterims › Kita";
    }
    // P0 — size is extracted ONLY inside a recognized size construction
    // (a size word like „dydžio“ must exist; the letter must be a standalone
    // space-delimited token). Brand/model tokens („H&M“, „Model S“, „M4“)
    // never produce a size.
    if (/\bdydž\p{L}*/iu.test(text)) {
      const size = /\s(xs|s|m|l|xl|xxl|xxxl)(?=$|\s|[,.;])/iu.exec(text)?.[1];
      if (size) attributes.size = size.toUpperCase();
    }
    const color = [...COLOR_TOKENS].find((c) => text.toLowerCase().includes(c));
    if (color) attributes.color = colorNomNative(color);
    // P0 — the current text is the single fact authority: only default the
    // condition when the user did not state it explicitly.
    if (!hasExplicitConditionInText(text)) {
      attributes.condition = "Gera";
    }
  } else if (category === "home") {
    if (/ąžuol|azuol/iu.test(text)) attributes.material = "Ąžuolas";
  } else if (category === "services") {
    if (/\bvalym/iu.test(text)) attributes.serviceType = "Valymas";
    else if (/\bremont/iu.test(text)) attributes.serviceType = "Remontas";
  } else if (category === "jobs") {
    const role = /(pardav[eė]j\p{L}*|vairuotoj\p{L}*|buhalter\p{L}*|kasinink\p{L}*|vir[eė]j\p{L}*|inžinier\p{L}*|vadybinink\p{L}*|specialist\p{L}*|darbuotoj\p{L}*|apskait\p{L}*)/iu.exec(text)?.[1];
    if (role) attributes.jobTitle = capitalizeFirst(nounNominativeSafe(role.toLowerCase()));
    const salary = /\batlyginimas\s+(\d[\d\s.,-]*)/iu.exec(text)?.[1]?.replace(/\D+/g, "");
    if (salary) attributes.salaryMin = salary;
  }
  // F9 — user-spoken condition survives for EVERY category, not just fashion.
  if (!attributes.condition) {
    if (hasExplicitNewConditionInText(text)) {
      attributes.condition = "Nauja";
    } else if (hasExplicitUsedConditionInText(text)) {
      attributes.condition = "Naudota";
    }
  }
  const listingDraft = {
    title,
    description: buildFallbackDescription({ title, category, make, location }),
    // F9 — a price the user already said must survive the fallback; never
    // silently zero it (the deterministic parser is the authority).
    price: extractPriceFromSellText(text),
    location: sanitizeFallbackListingCity(location),
    contact: ctx.contact?.trim() || "",
    category,
    confidence: 0.72,
    attributes,
  };
  return {
    reply: buildListingDraftUpdateReply({
      category,
      title,
      description: listingDraft.description,
      price: listingDraft.price,
      location: listingDraft.location,
      attributes,
    }),
    quickReplies: [],
    action: { type: "listing_draft", listingDraft },
  };
}

export const DOCUMENT_OCR_SOFT_NOTE =
  "Techninio paso nuotrauka kiek neryški — užpildžiau tai, ką įžiūrėjau. Galite patikslinti metus ar variklį čia pokalbyje, arba įkelti aiškesnę nuotrauką per (+).";
