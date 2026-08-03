/**
 * Search fast-path + strict NLP intent isolation (shared client/server).
 * Selection opens recent results in <1s; SQL search must survive Render cold DB
 * and large listing rows (keep in sync with AI_TIMEOUT_POLICY.searchSqlMs).
 */

export const SEARCH_SQL_TIMEOUT_MS = 8_000;

const SELECTION_RE =
  /\b(šit[aą]|sita|šit[aą]s|sitas|an[aą]|anas|pirm[aą]|antra|trečia|trečia|šį|si|tą|ta)\b|\b(tinka|parodyk|rodyk|atidaryk|atverk|atverk|open|show)\b/i;

const SELECTION_PHRASE_RE =
  /\b(šit[aą]\s+tinka|sita\s+tinka|šit[aą]s\s+tinka|sitas\s+tinka|viskas\s+tinka\s+šit|parodyk\s+(šit|si|man\s+šit)|atidaryk(\s+šit|\s+si|\s+man)?|rodyk\s+šit|open\s+this|this\s+one)\b/i;

const BROWSE_SCOPE_RE =
  /\b(visus?|viska|viskas|all|everything|catalog|katalog|skelbimus?|prekes?|turgu|marketplace)\b/i;

const SEARCH_VERB_RE =
  /\b(ieškau|ieskau|ieškojau|ieskojau|rask|surask|parodyk|rodyk|noriu|reikia|domina|find|search|show|atidaryk|looking\s+for)\b/i;

const STOP_TOKENS = new Set([
  "ieskau",
  "ieškau",
  "ieskojau",
  "ieškojau",
  "rask",
  "surask",
  "parodyk",
  "rodyk",
  "noriu",
  "reikia",
  "domina",
  "find",
  "search",
  "show",
  "looking",
  "for",
  "man",
  "prašau",
  "prasau",
  "please",
  "skelbima",
  "skelbimą",
  "skelbimus",
  "iki",
  "nuo",
  "pigiau",
  "nei",
  "uz",
  "už",
  "eur",
  "euro",
  "lt",
  "lietuvoje",
  "mieste",
  // Conversational glue — never AND-match as product tokens
  "kokius",
  "kokias",
  "kokie",
  "kokia",
  "koki",
  "kokį",
  "nors",
  "betkokius",
  "betkokias",
  "betkokie",
  "tokius",
  "tokias",
  "tokie",
  "tokia",
  "gal",
  "cia",
  "čia",
  "noreciau",
  "norėčiau",
  "galetum",
  "galėtum",
]);

/** Broad category asks — do not exclusive-filter to literal title substring hits. */
const BROAD_CATEGORY_QUERY_RE =
  /\b(r[uū]b\w*|drabu[zž]\w*|aprang\w*|paslaug\w*|servis\w*|automobil\w*|ma[sš]in\w*|auto\b|cars?|vehicles?|elektronik\w*|bald\w*|clothing|clothes|services?)\b/i;

const LT_CITIES: Array<[RegExp, string]> = [
  [/vilniuje|\bvilnius\b/i, "Vilnius"],
  [/kaune|\bkaunas\b/i, "Kaunas"],
  [/klaip[eė]doje|\bklaip[eė]da\b/i, "Klaipėda"],
  [/panev[eė][žz]yje|\bpanev[eė][žz]ys\b/i, "Panevėžys"],
  [/šiauliuose|\bšiauliai\b/i, "Šiauliai"],
  [/alytuje|\balytus\b/i, "Alytus"],
  [/marijampol[eė]je|\bmarijampol[eė]\b/i, "Marijampolė"],
];

/** Physical-goods nouns — never mix with services/jobs results. */
const PHYSICAL_GOODS_RE =
  /\b(gitar|gitara|pianin|smuik|būgn|dvirat|telefon|iphone|samsung|laptop|kompiuter|sof[aą]|bald|paveiksl|televiz|konsol|žaidim|lego|kamera|objektyv|laikrod|rankin|krepš|batai|ked|suknel|striuk|automobil|masin|bmw|audi|volvo|mercedes|toyota)\b/i;

const SERVICES_QUERY_RE =
  /\b(paslaug|meistr|detali[nz]|plovim|vaškav|valym|remont|kirpim|elektrik|santechn|pamok|kurs)\b/i;

export type SearchNlFilters = {
  keyword: string;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  category?: string;
};

export type RecentListingPick = {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  description?: string;
};

export function isResultSelectionIntent(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 80) return false;
  if (BROWSE_SCOPE_RE.test(t) && !SELECTION_PHRASE_RE.test(t)) return false;
  // Listing confirmation “viskas tinka” without deixis is NOT a result pick.
  if (/^viskas\s+tinka\b/i.test(t) && !/\b(šit|sit|an)/i.test(t)) return false;

  // “parodyk gitarą” / “atidaryk volvo” = search, not selection.
  const leftover = t
    .replace(/\b(parodyk|rodyk|atidaryk|atverk|show|open)\b/gi, " ")
    .replace(
      /\b(šit[aą]s?|sitas?|an[aą]s?|man|prašau|prasau|tinka|skelbim\w*|pirm\w*|antr\w*|treč\w*|\d+)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  if (leftover.length >= 3) return false;

  if (SELECTION_PHRASE_RE.test(t)) return true;
  if (SELECTION_RE.test(t) && t.split(/\s+/).length <= 6) return true;
  if (/^(pirm[aą]|antra|trečia|1|2|3)(\s+(tinka|skelbim\w*))?$/i.test(t)) {
    return true;
  }
  return false;
}

const REVEAL_RESULTS_RE =
  /^(nematau|nebematau|nesimato|nerandu(\s+(j[uų]|skelbim\w*|rezultat\w*))?|n[eė]ra(\s+(j[uų]|rezultat\w*|skelbim\w*))?|kur\s+(jie|jos|skelbim\w*|rezultat\w*|mano\s+skelbim\w*)|parodyk\s+(juos|jas|man\s+juos|rezultat\w*|skelbim\w*|čia|cia)|kur\s+jie\??)\??\.?$/i;

/**
 * UI meta-feedback: user cannot see active results on screen.
 * Must NOT become a keyword search for "Nematau" / "Kur jie?".
 */
export function isRevealActiveResultsIntent(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length > 48) return false;
  if (isResultSelectionIntent(t)) return false;
  if (PHYSICAL_GOODS_RE.test(t) || SERVICES_QUERY_RE.test(t)) return false;
  // Bare "Parodyk" stays browse-all; only "parodyk juos/rezultatus/…" is reveal.
  if (/^parodyk$/i.test(t)) return false;
  return REVEAL_RESULTS_RE.test(t);
}

function ordinalIndex(text: string): number {
  const t = text.toLowerCase();
  if (/\b(pirm|1)\b/.test(t)) return 0;
  if (/\b(antr|2)\b/.test(t)) return 1;
  if (/\b(treč|trec|3)\b/.test(t)) return 2;
  return 0;
}

/** Pick a listing from recent search/session results — no LLM. */
export function resolveRecentListingSelection(
  text: string,
  listings: RecentListingPick[] | undefined | null
): RecentListingPick | null {
  if (!listings?.length) return null;
  if (!isResultSelectionIntent(text)) return null;
  const idx = Math.min(ordinalIndex(text), listings.length - 1);
  const t = text.toLowerCase();
  const titled = listings.find((l) => {
    const title = l.title.toLowerCase();
    const tokens = significantTokens(text).filter((w) => w.length >= 4);
    return tokens.some((tok) => title.includes(tok));
  });
  if (titled && !/\b(pirm|antr|treč|1|2|3)\b/.test(t)) return titled;
  return listings[idx] ?? listings[0] ?? null;
}

export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s€]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_TOKENS.has(w) && !/^\d+$/.test(w));
}

/** Strict NLP: keyword + price + exact city from the latest utterance only. */
export function extractSearchNlFilters(text: string): SearchNlFilters {
  const raw = text.trim();
  // UI meta-feedback must never become a product keyword.
  if (isRevealActiveResultsIntent(raw)) {
    return { keyword: "" };
  }
  let working = raw;

  let maxPrice: number | undefined;
  let minPrice: number | undefined;

  const maxPatterns = [
    /(?:iki|max|ne\s+daugiau(?:\s+kaip)?|pigiau\s+nei|mažiau\s+nei|maziau\s+nei)\s*(\d[\d\s]{0,6})\s*(?:€|eur)?/i,
    /\b(\d[\d\s]{1,6})\s*(?:€|eur)\s*(?:iki|max)?/i,
  ];
  for (const re of maxPatterns) {
    const m = working.match(re);
    if (!m?.[1]) continue;
    const n = Number(m[1].replace(/\s+/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) {
      maxPrice = Math.round(n);
      working = working.replace(m[0], " ");
      break;
    }
  }

  const minMatch = working.match(
    /(?:nuo|min|ne\s+mažiau(?:\s+kaip)?|brangiau\s+nei)\s*(\d[\d\s]{0,6})\s*(?:€|eur)?/i
  );
  if (minMatch?.[1]) {
    const n = Number(minMatch[1].replace(/\s+/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) {
      minPrice = Math.round(n);
      working = working.replace(minMatch[0], " ");
    }
  }

  let city: string | undefined;
  for (const [re, name] of LT_CITIES) {
    if (re.test(raw)) {
      city = name;
      working = working.replace(re, " ");
      break;
    }
  }

  working = working
    .replace(SEARCH_VERB_RE, " ")
    .replace(/\b(skelbimus?|skelbimą|skelbima)\b/gi, " ")
    .replace(
      /\b(kokius|kokias|kokie|kokia|kok[iį]|nors|bet\s*kok\w*|tokius|tokias|tokie|tokia|domina|nor[eė][cč]iau|gal[eė]tum(?:[eė]te)?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  const keyword = working
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_TOKENS.has(w.toLowerCase()))
    .join(" ")
    .trim();

  return {
    // Prefer cleaned keyword; fall back to raw only when nothing left AND not filler-only.
    keyword: keyword || (STOP_TOKENS.has(raw.toLowerCase()) ? "" : raw),
    ...(minPrice != null ? { minPrice } : {}),
    ...(maxPrice != null ? { maxPrice } : {}),
    ...(city ? { city } : {}),
  };
}

export function isPhysicalGoodsQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (SERVICES_QUERY_RE.test(t) && !PHYSICAL_GOODS_RE.test(t)) return false;
  return PHYSICAL_GOODS_RE.test(t);
}

export function isServicesDominantQuery(text: string): boolean {
  return SERVICES_QUERY_RE.test(text) && !PHYSICAL_GOODS_RE.test(text);
}

/** Cardinal topic change — do not merge prior search filters. */
export function isSearchTopicPivot(
  previousQuery: string | undefined | null,
  nextText: string
): boolean {
  const prev = (previousQuery ?? "").trim();
  const next = nextText.trim();
  if (!prev || !next) return false;
  if (isResultSelectionIntent(next)) return false;
  if (isRevealActiveResultsIntent(next)) return false;

  const prevTokens = new Set(significantTokens(prev));
  const nextTokens = significantTokens(next);
  if (!prevTokens.size || !nextTokens.length) return false;

  const overlap = nextTokens.filter((t) => prevTokens.has(t));
  if (overlap.length > 0) return false;

  // Different product nouns with no shared stems → hard reset.
  if (SEARCH_VERB_RE.test(next) || isPhysicalGoodsQuery(next) || nextTokens.length >= 1) {
    return true;
  }
  return false;
}

export function listingPathForId(id: string): string {
  return `/listing/?id=${encodeURIComponent(id)}`;
}

export async function withSearchSqlTimeout<T>(
  work: Promise<T>,
  timeoutMs = SEARCH_SQL_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`search_sql_timeout_${timeoutMs}`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Prefer title keyword hits; drop services/jobs when shopping physical goods. */
export function applyStrictSearchBoundaries<
  T extends { id: string; title: string; category: string; description?: string },
>(rows: T[], query: string): T[] {
  if (!rows.length) return rows;
  const q = query.trim();
  if (!q) return rows;

  let next = rows;
  if (isPhysicalGoodsQuery(q) && !isServicesDominantQuery(q)) {
    next = next.filter(
      (r) => r.category !== "services" && r.category !== "jobs"
    );
  }

  // Broad category asks („rūbai“, „automobilis“, „paslaugos“) — keep full SQL set.
  if (BROAD_CATEGORY_QUERY_RE.test(q) && significantTokens(q).length <= 2) {
    return next;
  }

  const tokens = significantTokens(q);
  if (!tokens.length) return next;

  const stem = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFC")
      .replace(/(omis|uose|yse|ams|ais|ių|ų|us|as|ės|ei|ę|ą|į|io|is|ė)$/u, "");

  const scored = next.map((r) => {
    const title = r.title.toLowerCase().normalize("NFC");
    const desc = (r.description ?? "").toLowerCase().normalize("NFC");
    let score = 0;
    for (const tok of tokens) {
      const variants = [tok, stem(tok)].filter((v) => v.length >= 2);
      if (variants.some((v) => title.includes(v))) score += 10;
      else if (variants.some((v) => desc.includes(v))) score += 2;
    }
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const withHits = scored.filter((s) => s.score >= 10).map((s) => s.r);
  // Exclusive title filter only when it still covers a meaningful share of hits;
  // otherwise keep the full ranked set (avoids returning 1 of 3 cars).
  if (withHits.length && withHits.length >= Math.min(2, next.length)) {
    return withHits;
  }
  if (withHits.length && withHits.length === next.length) return withHits;
  // Sparse title hits on a larger SQL set → keep all (category / soft match).
  if (withHits.length && withHits.length < next.length && next.length >= 2) {
    return next;
  }
  return scored.map((s) => s.r);
}
