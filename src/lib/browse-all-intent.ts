/**
 * Semantic “show entire catalog” intent — loose keyword matching (LT + EN).
 * Used by search bar, agent context, conductor, and display pipeline.
 */

import type { VautoAgentAction } from "@/lib/vauto-agent-client";

const SEARCH_PREFIX =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+man)?|rodyk(?:\s+man)?|atidaryk(?:\s+man)?|atverk(?:\s+man)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show|browse|open|go)\s+/i;

/** Product tokens — if present without a browse-scope token, this is NOT browse-all. */
const PRODUCT_HINT =
  /\b(volvo|bmw|audi|mercedes|toyota|vw|ford|opel|iphone|samsung|xiaomi|huawei|butas|namas|but|batai|kedai|sukn|drabuz|telefon|kompiuter|nešioj|nesioj|dvirat|motocikl|automob|laptop|sofa|stalas|kede|šald|sald|playstation|xbox|nintendo|macbook|ipad|galaxy|passat|golf|octavia|fabia|prius|kombi|sedan|visureig|visureigis|v70|v60|xc\d|a\d|e\d|q\d)\b/;

/** Command verbs — “show me”, “open”, not product names. */
const BROWSE_VERB_RE =
  /\b(parodyk|parodyti|rodyk|rodyti|atidaryk|atverk|open|show|browse|display|list|go|take|navigate|rask|surask|find|search)\b/;

/** Scope tokens — “all”, “everything”, listings catalog. */
const BROWSE_SCOPE_RE =
  /\b(visus?|viska|viskas|all|everything|catalog|catalogue|katalog|skelbimus?|skelbimus|prekes?|prekės|turgu|turgų|marketplace|market|grid|feed|naujaus)\b/;

/** Seller listing confirmation — must NOT trigger browse-all (e.g. „Viskas tinka“). */
const LISTING_CONFIRMATION_RE =
  /\b(viskas\s+tinka|viskas\s+gerai|viskas\s+ok|viskas\s+tikslu|viskas\s+tvarkoje|taip,?\s*viskas|viskas\s+atitinka)\b/;

/** High-confidence full-phrase shortcuts (folded ASCII). */
const BROWSE_PHRASE_RE =
  /\b(show\s+all|browse\s+all|parodyk\s+vis\w*|rodyk\s+vis\w*|atidaryk\s+vis\w*|atverk\s+vis\w*|visi\s+skelbim\w*|visus\s+skelbim\w*|rodyti\s+visus|open\s+all|everything)\b/;

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

/**
 * True when ANY candidate utterance is a browse-catalog command.
 * Pass raw user text, sanitized text, tool query, and lastUserQuery.
 */
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

export function isListingConfirmationPhrase(raw: string): boolean {
  const folded = foldLtForBrowseMatch(raw);
  return Boolean(folded && LISTING_CONFIRMATION_RE.test(folded));
}

export function isBrowseAllIntent(raw: string): boolean {
  const q = raw.trim();
  if (!q) return false;

  const folded = foldLtForBrowseMatch(q);
  if (!folded) return false;

  if (isListingConfirmationPhrase(q)) return false;

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

export function createBrowseAllAction(
  listingCount?: number
): Extract<VautoAgentAction, { type: "browse_all" }> {
  return {
    type: "browse_all",
    replyMessage: buildBrowseAllReply(listingCount),
    listingCount,
  };
}

/** Strip browse-all command phrases so ranking/sidebar never treat them as product queries. */
export function effectiveMarketplaceSearchQuery(searchQuery: string): string {
  if (!searchQuery.trim()) return "";
  if (resolveBrowseAllIntent(searchQuery)) return "";
  return searchQuery;
}

/** @deprecated Use isBrowseAllIntent */
export const BROWSE_ALL_RE = BROWSE_PHRASE_RE;
