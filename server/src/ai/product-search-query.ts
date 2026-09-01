/** Normalize user text to a clean product query — never inject synthetic „dalys“. */

import {
  inferUniversalListingCategory,
  isJobSearchQuery,
  jobSearchKeywordQuery,
} from "./universal-search-intent.js";

/** Conversational fillers — strip so SQL never AND-matches „kokius nors“. */
const FILLER_TOKEN_RE =
  /\b(kokius|kokias|kokie|kokia|kok[iį]|nors|bet\s*kok\w*|betkok\w*|domina|nor[eė][cč]iau|gal[eė]tum(?:[eė]te)?|pra[sš]au|please|man|gal|čia|cia|tokius|tokias|tokie|tokia|truput[iį]|[sš]iek\s*tiek|siektiek|ka[zž]k[aą]|kazk[aą]|pigesn\w*|pigiau|ger[aą]|naujesn\w*)\b/gi;

const SEARCH_PREFIX_RE =
  /^(?:ieškau|ieskau|ieškojau|ieskojau|rask|surask|parodyk|rodyk|noriu|reikia|domina|find|search|show|looking\s+for)\s+/i;

/**
 * Broad category nouns → browse whole category (marškinėliai under „rūbai“,
 * all cars under „automobilis“) instead of literal title AND-match.
 */
const BROAD_CATEGORY_RULES: Array<{
  re: RegExp;
  category: string;
}> = [
  {
    re: /\b(r[uū]b\w*|drabu[zž]\w*|aprang\w*|clothing|clothes|outfit|mados\s+prek)\b/i,
    category: "clothing",
  },
  {
    re: /\b(paslaug\w*|servis\w*|services?)\b/i,
    category: "services",
  },
  {
    // F3 — no transport bias: generic "mašina" (siuvimo/skalbimo/indų/…)
    // must never force vehicles; brands/"automobilis" still do.
    re: /\b(automobil\w*|(?<!siuvimo |skalbimo |ind[ųu] |plovimo |kavos |duonos )ma[sš]in\w*|auto\b|cars?|vehicles?|transport\w*)\b/i,
    category: "vehicles",
  },
  {
    re: /\b(elektronik\w*|telefon\w*|phones?|gadget\w*)\b/i,
    category: "electronics",
  },
  {
    re: /\b(bald\w*|nam[uų]\s+prek|home\s+goods|interjer\w*)\b/i,
    category: "home",
  },
  {
    re: /\b(nekilnojam\w*|nt\b|but\w*|nam\w*|real\s*estate)\b/i,
    category: "real_estate",
  },
  {
    // F5 — "ieškau darbo kėdės" is furniture, not a job search.
    re: /\b(darb\w*(?!\w*\s*(k[ėe]d\w*|st[ao]l\w*|bald\w*))\b|job\w*|vakancij\w*|karjer\w*)\b/i,
    category: "jobs",
  },
];

export type ProductSearchIntent = {
  /** Clean keyword for ILIKE — empty when browsing a whole category. */
  keyword: string;
  category?: string;
  /**
   * True when the utterance is essentially a category ask
   * („rūbai“, „ieškau automobilio“, „paslaugos“) — return all matches in category.
   */
  categoryBrowse: boolean;
};

function stripSearchPrefixes(raw: string): string {
  return raw.replace(SEARCH_PREFIX_RE, "").trim();
}

function stripFillers(raw: string): string {
  return raw
    .replace(FILLER_TOKEN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchBroadCategory(text: string): string | undefined {
  for (const rule of BROAD_CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.category;
  }
  return undefined;
}

/** Remaining tokens after removing the broad-category noun itself. */
function stripBroadCategoryNoun(text: string, category: string): string {
  const rule = BROAD_CATEGORY_RULES.find((r) => r.category === category);
  if (!rule) return text;
  return text.replace(rule.re, " ").replace(/\s+/g, " ").trim();
}

function titleCaseQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.length <= 3
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ")
    .replace(/\bVolvo\b/i, "Volvo")
    .replace(/\bBmw\b/i, "BMW");
}

/**
 * Flexible intent extraction: drop conversational glue, map category synonyms,
 * keep specific product tokens (Armani, Volvo V70, dydis 42).
 */
export function extractProductSearchIntent(raw: string): ProductSearchIntent {
  const trimmed = raw.trim();
  if (!trimmed) return { keyword: "", categoryBrowse: false };

  if (isJobSearchQuery(trimmed)) {
    const role = jobSearchKeywordQuery(trimmed);
    return {
      keyword: role,
      category: "jobs",
      categoryBrowse: !role,
    };
  }

  let working = stripSearchPrefixes(trimmed);
  working = stripFillers(working);
  working = working.replace(/\s+(auto\s+)?dalys$/i, "").trim();

  const broad = matchBroadCategory(working) ?? matchBroadCategory(trimmed);
  if (broad) {
    const leftover = stripBroadCategoryNoun(working, broad);
    // Pure / near-pure category ask → browse all in category.
    if (!leftover || leftover.length < 2) {
      return { keyword: "", category: broad, categoryBrowse: true };
    }
    // „raudoni rūbai“ / „pigus automobilis BMW“ — keep specifics + category hint.
    return {
      keyword: titleCaseQuery(leftover),
      category: broad,
      categoryBrowse: false,
    };
  }

  const inferred = inferUniversalListingCategory(trimmed);
  if (!working) {
    return {
      keyword: "",
      category: inferred,
      categoryBrowse: Boolean(inferred),
    };
  }

  return {
    keyword: titleCaseQuery(working),
    category: inferred,
    categoryBrowse: false,
  };
}

export function normalizeProductSearchQuery(raw: string): string {
  const intent = extractProductSearchIntent(raw);
  if (intent.categoryBrowse) return intent.keyword;
  if (intent.keyword) return intent.keyword;
  return raw.trim();
}

export function inferSearchCategory(query: string): string | undefined {
  return (
    extractProductSearchIntent(query).category ??
    inferUniversalListingCategory(query)
  );
}

/** True when the query should return the whole category, not title-literal hits. */
export function isCategoryBrowseQuery(raw: string): boolean {
  return extractProductSearchIntent(raw).categoryBrowse;
}
