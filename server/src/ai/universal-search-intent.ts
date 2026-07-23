/** VAUTO — universal multi-category classifieds intent (server). */

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

export function inferUniversalListingCategory(query: string): string | undefined {
  if (isJobSearchQuery(query)) return "jobs";
  if (/\b(but|nam|nuom|sklyp|kamb|nt\b|nekilnoj|aruod)\b/i.test(query)) return "real_estate";
  if (/\b(bat|ked|aulis|drabu|striuk|sukn)\b/i.test(query)) return "clothing";
  // Physical goods before services — “gitara” must not become detailing/services.
  if (
    /\b(gitar|pianin|smuik|būgn|paveiksl|dvirat|sof[aą]|bald|komod|virtuv|televiz|konsol)\b/i.test(
      query
    ) &&
    !/\b(paslaug|pamok|kurs|meistr|detali[nz]|plovim)\b/i.test(query)
  ) {
    return "home";
  }
  if (
    /\b(meistr|paslaug|elektrik|santechn|valym|remont|detali[nz]|plovim|vaškav)\b/i.test(
      query
    ) &&
    !/\b(gitar|telefon|iphone|automobil|bmw|volvo)\b/i.test(query)
  ) {
    return "services";
  }
  if (/\b(telefon|iphone|samsung|laptop|kompiuter)\b/i.test(query)) return "electronics";
  if (/\b(volvo|bmw|audi|v70|v60|auto|masin|automob|transport)\b/i.test(query)) return "vehicles";
  if (/\b(bald|sofa|komod|virtuv)\b/i.test(query) && !isJobSearchQuery(query)) return "home";
  return undefined;
}

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
