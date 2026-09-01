/** VAUTO — universal multi-category classifieds intent (server). */

const JOB_SEARCH_RE =
  /\b(ie[sš]kau\s+darb|ieskau\s+darb|darbo\s+skelbim|darbo\s+pasiūlym|darbas|darbo|atlyginim|atlygin|algos|cv\b|karjera|karjer|vakancij|įdarbinim|idarbinim|samdom|bedarb)\b/i;

const JOB_FALSE_POSITIVE_RE =
  /\b(darbo\s+k[ėe]d(?:[ėę]s?|es)\b|darbo\s+st[ao]l(?:o|as|u|ą)\b|ergonomin.*k[ėe]d|office\s+chair)\b/i;

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
  if (
    /\b(bat|ked|aulis|drabu|striuk|sukn|r[uū]b|aprang|mar[sš]kin|kelnes|kelni|d[zž]ins|švark|svark)\b/i.test(
      query
    )
  ) {
    return "clothing";
  }
  // Physical goods before services — “gitara” must not become detailing/services.
  // F5 — inflection-tolerant stems (sofos/sofa/batus…), no exact-stem \b traps.
  if (
    /\b(gitar\w*|pianin\w*|smuik\w*|b[ūu]gn\w*|paveiksl\w*|dvirat\w*|sof\w*|bald\w*|komod\w*|virtuv\w*|televiz\w*|konsol\w*)\b/i.test(
      query
    ) &&
    !/\b(paslaug|pamok|kurs|meistr|detali[nz]|plovim)\b/i.test(query)
  ) {
    return "home";
  }
  if (
    /\b(meistr|paslaug|elektrik|santechn|valym|remont|detali[nz]|plovim|vaškav|servis)\b/i.test(
      query
    ) &&
    !/\b(gitar|telefon|iphone|automobil|bmw|volvo|r[uū]b)\b/i.test(query)
  ) {
    return "services";
  }
  if (/\b(telefon|iphone|samsung|laptop|kompiuter|elektronik)\b/i.test(query)) {
    return "electronics";
  }
  // F3 — no transport bias: generic "mašina" (siuvimo/skalbimo/indų/…) must
  // never force vehicles; brands/models/"automobilis" still do.
  if (
    /\b(volvo|bmw|audi|v70|v60|automob|transport|cars?|vehicles?|(?<!siuvimo |skalbimo |ind[ųu] |plovimo |kavos |duonos )ma[sš]in\w*)\b/i.test(
      query
    )
  ) {
    return "vehicles";
  }
  if (/\b(bald\w*|sof\w*|komod\w*|virtuv\w*)\b/i.test(query) && !isJobSearchQuery(query)) return "home";
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
