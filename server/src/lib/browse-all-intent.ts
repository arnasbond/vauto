/**
 * Server mirror — semantic browse-all intent (LT + EN).
 */

const SEARCH_PREFIX =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+man)?|rodyk(?:\s+man)?|atidaryk(?:\s+man)?|atverk(?:\s+man)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show|browse|open|go)\s+/i;

const PRODUCT_HINT =
  /\b(volvo|bmw|audi|mercedes|toyota|vw|ford|opel|iphone|samsung|xiaomi|huawei|butas|namas|but|batai|kedai|sukn|drabuz|telefon|kompiuter|nešioj|nesioj|dvirat|motocikl|automob|laptop|sofa|stalas|kede|šald|sald|playstation|xbox|nintendo|macbook|ipad|galaxy|passat|golf|octavia|fabia|prius|kombi|sedan|visureig|visureigis|v70|v60|xc\d|a\d|e\d|q\d)\b/;

const BROWSE_VERB_RE =
  /\b(parodyk|parodyti|rodyk|rodyti|atidaryk|atverk|open|show|browse|display|list|go|take|navigate|rask|surask|find|search)\b/;

const BROWSE_SCOPE_RE =
  /\b(visus?|viska|viskas|all|everything|catalog|catalogue|katalog|skelbimus?|skelbimus|prekes?|prekės|turgu|turgų|marketplace|market|grid|feed|naujaus)\b/;

const BROWSE_PHRASE_RE =
  /\b(show\s+all|browse\s+all|parodyk\s+vis\w*|rodyk\s+vis\w*|atidaryk\s+vis\w*|atverk\s+vis\w*|visi\s+skelbim\w*|visus\s+skelbim\w*|rodyti\s+visus|open\s+all|everything|viskas)\b/;

export function foldLtForBrowseMatch(raw: string): string {
  return raw
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
    .replace(/[!?.,…]+$/g, "")
    .trim();
}

export function stripBrowseSearchPrefixes(raw: string): string {
  let q = raw.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(/\b(skelbimus?|skelbimus)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim();
}

function tokensAreBrowseOnly(tokens: string[]): boolean {
  if (!tokens.length) return false;
  const allowed =
    /^(visus?|viska|viskas|all|man|mano|please|prašau|prasau|skelbimus?|prekes?|turgu|parodyk|rodyk|atidaryk|atverk|rodyti|show|browse|open|rask|surask|find|search|go|take|naujaus|naujausius)$/;
  return tokens.every((t) => allowed.test(t));
}

export function resolveBrowseAllIntent(
  ...candidates: Array<string | null | undefined>
): boolean {
  for (const c of candidates) {
    if (c && isBrowseAllIntent(c)) return true;
  }
  const merged = candidates
    .map((c) => c?.trim())
    .filter(Boolean)
    .join(" ");
  return merged.length > 0 && isBrowseAllIntent(merged);
}

export function isBrowseAllIntent(raw: string): boolean {
  const q = raw.trim();
  if (!q) return false;

  const folded = foldLtForBrowseMatch(q);
  if (!folded) return false;

  if (BROWSE_PHRASE_RE.test(folded)) return true;

  const tokens = folded.split(/\s+/).filter(Boolean);

  if (tokens.length === 1 && BROWSE_SCOPE_RE.test(tokens[0]!)) return true;

  const hasVerb = BROWSE_VERB_RE.test(folded);
  const hasScope = BROWSE_SCOPE_RE.test(folded);
  const hasProduct = PRODUCT_HINT.test(folded);

  if (hasVerb && hasScope) return true;

  if (hasScope && !hasProduct && tokens.length <= 4) return true;

  if (hasVerb && !hasProduct && tokens.length <= 3 && tokensAreBrowseOnly(tokens)) {
    return true;
  }

  const stripped = stripBrowseSearchPrefixes(folded);
  if (
    !stripped &&
    BROWSE_VERB_RE.test(folded) &&
    (hasScope || /\bvis/.test(folded))
  ) {
    return true;
  }

  if (!stripped && BROWSE_VERB_RE.test(folded) && tokens.length <= 2) {
    return true;
  }

  if (tokens.length <= 4 && tokensAreBrowseOnly(tokens) && (hasScope || hasVerb)) {
    return true;
  }

  return false;
}

export function buildBrowseAllReply(listingCount?: number): string {
  const base = "Štai visi naujausi skelbimai. Galbūt ieškote kažko specifinio?";
  if (listingCount != null && listingCount > 0) {
    return `${base} Radau ${listingCount} aktyvių skelbimų.`;
  }
  return base;
}
