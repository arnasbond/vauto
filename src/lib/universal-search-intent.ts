import type { ListingCategory } from "@/lib/types";

/** VAUTO — universal multi-category classifieds (not auto-only). */

const JOB_SEARCH_RE =
  /\b(ie[sš]kau\s+darb|ieskau\s+darb|darbo\s+skelbim|darbo\s+pasiūlym|darbas|darbo|atlyginim|atlygin|algos|cv\b|karjera|karjer|vakancij|įdarbinim|idarbinim|samdom|bedarb)\b/i;

const JOB_FALSE_POSITIVE_RE =
  /\b(darbo\s+kėd|darbo\s+ked|darbo\s+stal|ergonomin.*kėd|office\s+chair)\b/i;

const RADIUS_KM_RE = /\b(\d{1,3})\s*km\b/i;

export function isJobSearchQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (JOB_FALSE_POSITIVE_RE.test(q)) return false;
  return JOB_SEARCH_RE.test(q);
}

export function extractSearchRadiusKm(query: string): number | null {
  const m = query.match(RADIUS_KM_RE);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  return 50;
}

export function inferUniversalListingCategory(query: string): ListingCategory | null {
  const q = query.toLowerCase();
  if (isJobSearchQuery(query)) return "jobs";
  if (/\b(but|nam|nuom|sklyp|kamb|nt\b|nekilnoj|aruod)\b/i.test(q)) return "real_estate";
  if (/\b(bat|batai|keden|aulis|drabu|striuk|suknel|palt|dydis|zara|nike|vinted|aprang)\b/i.test(q)) {
    return "clothing";
  }
  // Physical goods before services — avoid auto-detailing bleed on product nouns.
  if (
    /\b(gitar|pianin|smuik|būgn|paveiksl|dvirat|sof[aą]|bald|komod|virtuv|televiz|konsol)\b/i.test(
      q
    ) &&
    !/\b(paslaug|pamok|kurs|meistr|detali[nz]|plovim)\b/i.test(q)
  ) {
    return "home";
  }
  if (
    /\b(meistr|paslaug|elektrik|santechn|valym|remont|kirp|valytoj|detali[nz]|plovim|vaškav)\b/i.test(
      q
    ) &&
    !/\b(gitar|telefon|iphone|automobil|bmw|volvo)\b/i.test(q)
  ) {
    return "services";
  }
  if (/\b(telefon|iphone|samsung|laptop|kompiuter|planšet)\b/i.test(q)) return "electronics";
  if (/\b(volvo|bmw|audi|v70|v60|auto|masin|automob|transport|ratlank|padang)\b/i.test(q)) {
    return "vehicles";
  }
  if (/\b(bald|sofa|komod|virtuv|kėd|ked)\b/i.test(q) && !isJobSearchQuery(query)) return "home";
  return null;
}

/** Job search — avoid blind keyword „darbo“ matching furniture titles. */
export function jobSearchKeywordQuery(query: string): string {
  const q = query.trim();
  if (!isJobSearchQuery(q)) return q;
  const role =
    q.match(
      /\b(vairuotoj\w*|kurjer\w*|programuotoj\w*|buhalter\w*|barista\w*|pardavėj\w*|pardavej\w*|sandėlinink\w*|sandelinink\w*|valytoj\w*|meistr\w*|elektrik\w*)\b/i
    )?.[1] ?? "";
  return role.trim();
}

export function buildJobSearchConversationalReply(
  query: string,
  resultCount: number,
  userName?: string
): string {
  const radius = extractSearchRadiusKm(query);
  const radiusLabel = radius ? `${radius} km spinduliu` : "nurodytu spinduliu";
  const name = userName?.trim().split(/\s+/)[0];
  const vocative = name ? `${name}, ` : "";

  if (resultCount <= 0) {
    return `${vocative}matau, kad ieškote darbo ${radiusLabel}. Šiuo metu tikrinu darbo skelbimų kategoriją — kol kas atitikmenų neradau. Gal patikslinsime specialybę ar miestą?`;
  }

  const countLabel =
    resultCount === 1
      ? "1 darbo skelbimą"
      : `${resultCount} darbo skelbimus`;

  return `${vocative}matau, kad ieškote darbo ${radiusLabel}. Šiuo metu tikrinu darbo skelbimų kategoriją — radau ${countLabel}. Peržiūrėkite rezultatus ekrane.`;
}
