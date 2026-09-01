/**
 * F3 — universal query expansion & intent extraction (7 verticals).
 *
 * One deterministic, category-neutral parser that decomposes a free-text
 * search utterance into structured filters WITHOUT any LLM:
 *
 *   canonicalCategory → priceMin/priceMax/currency → location/radius →
 *   vertical-specific attributes (gated by category — no transport defaults) →
 *   clean free-text keywords (filter tokens stripped).
 *
 * Safety & resilience guarantees:
 *   - prompt-injection sanitized up front (blocked input yields a neutral,
 *     keyword-free query — never raw text forwarded);
 *   - every field is bounded via the canonical shared truncation;
 *   - the parser NEVER throws: internal failures fall back transparently to
 *     a tokenized keyword search (`fallbackTokenizedSearchQuery`) — AI DOWN /
 *     zero results are ordinary outcomes, never search failures.
 */
import {
  sanitizePromptUserInput,
} from "../../shared/prompt-injection.js";
import { truncateTextSafely } from "../../shared/text-truncation.js";
import {
  extractSearchNlFilters,
  significantTokens,
} from "../../shared/search-fast-path.js";
import {
  inferSearchCategory,
  isCategoryBrowseQuery,
} from "../product-search-query.js";
import { extractSearchRadiusKm } from "../universal-search-intent.js";

export const F3_SEARCH_BUDGET = {
  rawInput: 500,
  keywordCount: 8,
  keywordChars: 40,
  attributeCount: 10,
  attributeValueChars: 40,
  fallbackQueryChars: 160,
} as const;

export const F3_SEARCH_VERTICALS = [
  "vehicles",
  "real_estate",
  "electronics",
  "clothing",
  "home",
  "services",
  "jobs",
  "other",
] as const;

export type F3CanonicalCategory = (typeof F3_SEARCH_VERTICALS)[number];

export type UniversalSearchQuery = {
  canonicalCategory: F3CanonicalCategory;
  priceMin?: number;
  priceMax?: number;
  /** Platform currency — EUR only; extracted cue removed from keywords. */
  currency: "EUR";
  location?: string;
  radiusKm?: number;
  /** Vertical attributes, extracted ONLY for the resolved category (no transport bias). */
  verticalAttributes: Record<string, string | number | boolean>;
  freeTextKeywords: string[];
  categoryBrowse: boolean;
  injectionBlocked: boolean;
  /** Sanitized + bounded raw input (never original). */
  rawSanitized: string;
};

type AttrRule = [key: string, re: RegExp, kind: "string" | "number"];

const CURRENCY_RE = /\b(eur|eurai|eur[uų]|euro|€|euras)\b/i;
const RADIUS_RE = /(?:iki|per|spindul)\w*\s*(\d{1,3})\s*km/i;

/**
 * F3 — inflection-tolerant category vocabulary (stems, no trailing \b):
 * Lithuanian case endings and synonyms resolve equally across verticals.
 * Ordered so precise rules win over broad ones; the transport rule uses
 * negative lookbehinds so generic "mašina" (siuvimo/skalbimo/indų…) never
 * forces vehicles.
 */
const F3_CATEGORY_RULES: Array<[F3CanonicalCategory, RegExp]> = [
  [
    "jobs",
    /\b(ie[sš]kau\s+darb\w*|darbo\s+(skelbim\w*|pasi[ūu]l\w*)|vakancij\w*|atlyg\w*|atlyginim\w*|alg\w*|samd\w*|užimtum\w*|karjer\w*|cv\b|bedarb\w*)/i,
  ],
  [
    "real_estate",
    /\b(but\w*|nam\w*|nuom\w*|sklyp\w*|kambari\w*|nt\b|nekilnojam\w*)/i,
  ],
  [
    "clothing",
    /\b(bat\w*|ked\w*|auli\w*|drabu[zž]\w*|striuk\w*|suknel\w*|r[uū]b\w*|aprang\w*|mar[sš]kin\w*|keln\w*|d[zž]ins\w*|[sš]vark\w*|palt\w*|megztin\w*|sijon\w*)/i,
  ],
  [
    "electronics",
    /\b(telefon\w*|iphone|samsung|laptop\w*|kompiuter\w*|elektronik\w*|plan[šs]et\w*|ausin\w*|televizor\w*|monitor\w*|gadget\w*)/i,
  ],
  [
    "vehicles",
    /\b(volvo|bmw|audi|v70|v60|automobil\w*|transport\w*|cars?|vehicles?|(?<!siuvimo |skalbimo |ind[ųu] |plovimo |kavos |duonos )ma[sš]in\w*)\b/i,
  ],
  [
    "services",
    /\b(meistr\w*|paslaug\w*|elektrik\w*|santechnik\w*|valym\w*|remont\w*|detalin\w*|plovim\w*|vaškav\w*|servis\w*|kirp\w*|maniki[ūu]r\w*|pamok\w*|konsultacij\w*)/i,
  ],
  [
    "home",
    /\b(gitar\w*|pianin\w*|smuik\w*|b[ūu]gn\w*|paveiksl\w*|dvirat\w*|sof\w*|bald\w*|komod\w*|virtuv\w*|konsol\w*|st[ao]l\w*|lov\w*|k[ėe]d\w*|foteli\w*|veidrod\w*|lamp\w*|siuvimo\s+ma[sš]in\w*|skalbimo\s+ma[sš]in\w*)/i,
  ],
];

const VEHICLE_ATTRS: AttrRule[] = [
  ["year", /\b(19[5-9]\d|20[0-2]\d)\s*(?:m\.?)?\b/, "number"],
  ["fuel", /\b(benzin\w*|dyzel\w*|elektr\w*|hibrid\w*|duj\w*)\b/i, "string"],
  ["transmission", /\b(automat\w*|mekanik\w*|rankin[eė]\s*d[eė][zž][eė])\b/i, "string"],
];

const REAL_ESTATE_ATTRS: AttrRule[] = [
  ["rooms", /\b(\d{1,2})\s*(?:kamb\w*|k\.)\b/, "number"],
  ["area", /\b(\d{2,4})\s*(?:kv\.?\s*m|m2|m²|kvadr\w*)/i, "number"],
];

const ELECTRONICS_ATTRS: AttrRule[] = [
  ["storage", /\b(\d{1,4})\s*(?:gb|giga\w*)\b/i, "number"],
  ["condition", /\b(nauj\w*|naudot\w*|atnaujint\w*)\b/i, "string"],
];

const CLOTHING_ATTRS: AttrRule[] = [
  ["size", /\b(?:dydis\s*)?(\d{2}|[SMLXL]{1,3})\b(?:\s*dyd\w*)?/i, "string"],
  ["condition", /\b(nauj\w*|naudot\w*|kaip\s+nauj\w*)\b/i, "string"],
];

const JOBS_ATTRS: AttrRule[] = [
  ["salary", /\b(?:atlyg\w*|alga\w*|u[zž]mok\w*)\s*(\d{3,6})/i, "number"],
];

const VERTICAL_ATTR_RULES: Partial<Record<F3CanonicalCategory, AttrRule[]>> = {
  vehicles: VEHICLE_ATTRS,
  real_estate: REAL_ESTATE_ATTRS,
  electronics: ELECTRONICS_ATTRS,
  clothing: CLOTHING_ATTRS,
  jobs: JOBS_ATTRS,
};

/** Lithuanian instruction phrases the shared detector does not cover. */
const SEARCH_INSTRUCTION_RE =
  /\b(ignoruok\w*|ignoruoti|pamirš(?:k|ti|kite))\s+[\w\s-]{0,40}?(?:instrukcij\w*|taisyk\w*|nurodym\w*)\b|\b(publikuok\w*|vykdyk\w*|perrašyk\w*|publish\w*)\s+(?:visk\w*ą?|šiuos|šias|nurodym\w*|everything\b|all\b)/i;

function boundedNumber(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0 || value >= 10_000_000) return undefined;
  return Math.round(value);
}

/**
 * F4 — canonical price-notation normalization before NLP filter extraction:
 * "150.000€" → "150000€", "iki 150k" → "iki 150000", "under 300" → "iki 300".
 * A bare "150k" WITHOUT a price cue is ambiguous (mileage etc.) and stays a
 * keyword. Deterministic, pure, bounded.
 */
export function normalizeSearchPriceNotation(text: string): string {
  try {
    const bounded = truncateTextSafely(text, F3_SEARCH_BUDGET.rawInput);
    return bounded
      .replace(
        /\b(iki|nuo|max|min|under|below|iki\s+max|maziau|mažiau|pigiau|daugiau)\s+(\d{2,4})k\b/gi,
        (_m, cue, n) => `${cue} ${Number(n) * 1000}`
      )
      .replace(/\b(\d{2,4})k\s*(?=eur|eurai|eur[uų]|€)/gi, (_m, n) => `${Number(n) * 1000} `)
      .replace(
        /\b(\d{1,3}(?:\.\d{3})+)\s*(?=€|eur|eurai|eur[uų])/gi,
        (_m, n) => n.replace(/\./g, "")
      )
      .replace(/\bunder\s+(\d[\d\s]{0,6})(?=\s*(?:€|eur))?/gi, "iki $1")
      .replace(/\bbelow\s+(\d[\d\s]{0,6})(?=\s*(?:€|eur))?/gi, "iki $1");
  } catch {
    return text;
  }
}

function neutralQuery(rawSanitized: string, injectionBlocked: boolean): UniversalSearchQuery {
  return {
    canonicalCategory: "other",
    currency: "EUR",
    verticalAttributes: {},
    freeTextKeywords: [],
    categoryBrowse: false,
    injectionBlocked,
    rawSanitized,
  };
}

function resolveF3Category(text: string): F3CanonicalCategory {
  for (const [category, re] of F3_CATEGORY_RULES) {
    if (re.test(text)) return category;
  }
  const legacy = inferSearchCategory(text);
  return legacy ? (legacy as F3CanonicalCategory) : "other";
}

/**
 * AI-down transparent fallback: sanitized tokenized keyword search.
 * Never throws; bounded to F3_SEARCH_BUDGET.fallbackQueryChars.
 */
export function fallbackTokenizedSearchQuery(raw: string): string {
  try {
    const bounded = truncateTextSafely(raw, F3_SEARCH_BUDGET.rawInput);
    const { text, blocked } = sanitizePromptUserInput(bounded);
    if (blocked || SEARCH_INSTRUCTION_RE.test(text)) return "";
    return truncateTextSafely(
      significantTokens(text).join(" "),
      F3_SEARCH_BUDGET.fallbackQueryChars
    );
  } catch {
    return "";
  }
}

/** Parse a free-text search utterance into structured filters. Never throws. */
export function parseUniversalSearchQuery(raw: string): UniversalSearchQuery {
  try {
    const bounded = truncateTextSafely(raw, F3_SEARCH_BUDGET.rawInput);
    const safe = sanitizePromptUserInput(bounded);
    if (safe.blocked || SEARCH_INSTRUCTION_RE.test(safe.text)) {
      return neutralQuery(safe.text, true);
    }
    // F4 — canonical price notation before filter extraction.
    const text = normalizeSearchPriceNotation(safe.text);
    if (!text) return neutralQuery("", false);

    // 1. NLP filters (price/city) + keyword residue (existing certified logic).
    const nl = extractSearchNlFilters(text);
    const keywordBase = nl.keyword || text;

    // 2. Category — inflection-tolerant deterministic vocabulary (no LLM).
    const canonicalCategory = resolveF3Category(text);

    // 3. Vertical attributes — extracted from the FULL utterance (numbers are
    // dropped from nl.keyword), strictly gated by the resolved category.
    const verticalAttributes: Record<string, string | number | boolean> = {};
    let kwSource = keywordBase;
    const rules = VERTICAL_ATTR_RULES[canonicalCategory] ?? [];
    for (const [key, re, kind] of rules.slice(0, F3_SEARCH_BUDGET.attributeCount)) {
      const m = text.match(re);
      if (!m?.[1]) continue;
      const rawValue = m[1].trim();
      if (kind === "number") {
        const n = boundedNumber(Number(rawValue.replace(/[^\d]/g, "")));
        if (n === undefined) continue;
        verticalAttributes[key] = n;
      } else {
        verticalAttributes[key] = truncateTextSafely(
          rawValue.toLowerCase(),
          F3_SEARCH_BUDGET.attributeValueChars
        );
      }
      kwSource = kwSource.replace(m[0], " ");
    }

    // 4. Radius + currency cues (stripped from keywords).
    const radius = extractSearchRadiusKm(text);
    const radiusSpan = text.match(RADIUS_RE);
    if (radiusSpan) kwSource = kwSource.replace(radiusSpan[0], " ");
    if (CURRENCY_RE.test(text)) kwSource = kwSource.replace(CURRENCY_RE, " ");

    // 5. Free-text keywords: significant tokens minus every structured cue.
    const keywords = significantTokens(kwSource)
      .slice(0, F3_SEARCH_BUDGET.keywordCount)
      .map((w) => truncateTextSafely(w, F3_SEARCH_BUDGET.keywordChars))
      .filter(Boolean);

    return {
      canonicalCategory,
      ...(nl.minPrice !== undefined ? { priceMin: nl.minPrice } : {}),
      ...(nl.maxPrice !== undefined ? { priceMax: nl.maxPrice } : {}),
      currency: "EUR",
      ...(nl.city ? { location: nl.city } : {}),
      ...(radius != null ? { radiusKm: radius } : {}),
      verticalAttributes,
      freeTextKeywords: keywords,
      categoryBrowse: isCategoryBrowseQuery(text),
      injectionBlocked: false,
      rawSanitized: bounded,
    };
  } catch {
    // Fail-open to the tokenized keyword path — search must never fail.
    return {
      ...neutralQuery(truncateTextSafely(raw, F3_SEARCH_BUDGET.rawInput), false),
      freeTextKeywords: significantTokens(fallbackTokenizedSearchQuery(raw))
        .slice(0, F3_SEARCH_BUDGET.keywordCount),
    };
  }
}

/**
 * Safe entrypoint for search wiring: structured query when the parser
 * succeeded, transparent tokenized fallback otherwise. `usedFallback` is true
 * exactly when the tokenized keyword path was used (AI-down / parse failure).
 */
export function resolveUniversalSearchQuery(
  raw: string
): { query: UniversalSearchQuery; usedFallback: boolean } {
  try {
    return { query: parseUniversalSearchQuery(raw), usedFallback: false };
  } catch {
    return {
      query: {
        ...neutralQuery(truncateTextSafely(raw, F3_SEARCH_BUDGET.rawInput), false),
        freeTextKeywords: significantTokens(fallbackTokenizedSearchQuery(raw)).slice(
          0,
          F3_SEARCH_BUDGET.keywordCount
        ),
      },
      usedFallback: true,
    };
  }
}
