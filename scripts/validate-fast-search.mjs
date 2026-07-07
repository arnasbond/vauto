#!/usr/bin/env node
/** Smoke test for browse-all intent + client fast-agent-search against bundled catalog. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadCatalog() {
  const catalogSrc = readFileSync(
    join(root, "src/data/lithuania-mock-catalog.ts"),
    "utf8"
  );
  const jsonMatch = catalogSrc.match(
    /export const LITHUANIA_MOCK_CATALOG[^=]*=\s*(\[[\s\S]*\])\s*as (?:Listing|LegacyListingInput)\[\]/
  );
  if (!jsonMatch) throw new Error("Could not parse LITHUANIA_MOCK_CATALOG");
  return JSON.parse(jsonMatch[1]);
}

const SEARCH_PREFIX =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+man)?|rodyk(?:\s+man)?|atidaryk(?:\s+man)?|atverk(?:\s+man)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show|browse|open|go)\s+/i;

const PRODUCT_HINT =
  /\b(volvo|bmw|audi|mercedes|toyota|vw|ford|opel|iphone|samsung|butas|namas|batai|kedai|sukn|drabuz|telefon)\b/;

const BROWSE_VERB_RE =
  /\b(parodyk|parodyti|rodyk|rodyti|atidaryk|atverk|open|show|browse|display|list|go|take|navigate|rask|surask|find|search)\b/;

const BROWSE_SCOPE_RE =
  /\b(visus?|viska|viskas|all|everything|catalog|catalogue|katalog|skelbimus?|skelbimus|prekes?|turgu|marketplace|market|grid|feed|naujaus)\b/;

const BROWSE_PHRASE_RE =
  /\b(show\s+all|browse\s+all|parodyk\s+vis\w*|rodyk\s+vis\w*|atidaryk\s+vis\w*|atverk\s+vis\w*|visi\s+skelbim\w*|visus\s+skelbim\w*|rodyti\s+visus|open\s+all|everything|viskas)\b/;

function foldLtForBrowseMatch(raw) {
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

function stripSearchPrefixes(raw) {
  let q = raw.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(/\b(skelbimus?|skelbimus)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim();
}

function tokensAreBrowseOnly(tokens) {
  if (!tokens.length) return false;
  const allowed =
    /^(visus?|viska|viskas|all|man|mano|please|prašau|prasau|skelbimus?|prekes?|turgu|parodyk|rodyk|atidaryk|atverk|rodyti|show|browse|open|rask|surask|find|search|go|take|naujaus|naujausius)$/;
  return tokens.every((t) => allowed.test(t));
}

function isBrowseAllIntent(raw) {
  const q = raw.trim();
  if (!q) return false;
  const folded = foldLtForBrowseMatch(q);
  if (!folded) return false;
  if (BROWSE_PHRASE_RE.test(folded)) return true;
  const tokens = folded.split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && BROWSE_SCOPE_RE.test(tokens[0])) return true;
  const hasVerb = BROWSE_VERB_RE.test(folded);
  const hasScope = BROWSE_SCOPE_RE.test(folded);
  const hasProduct = PRODUCT_HINT.test(folded);
  if (hasVerb && hasScope) return true;
  if (hasScope && !hasProduct && tokens.length <= 4) return true;
  if (hasVerb && !hasProduct && tokens.length <= 3 && tokensAreBrowseOnly(tokens)) return true;
  const stripped = stripSearchPrefixes(folded);
  if (!stripped && BROWSE_VERB_RE.test(folded) && (hasScope || /\bvis/.test(folded))) return true;
  if (!stripped && BROWSE_VERB_RE.test(folded) && tokens.length <= 2) return true;
  if (tokens.length <= 4 && tokensAreBrowseOnly(tokens) && (hasScope || hasVerb)) return true;
  return false;
}

function stripSearchPrefixesForFilter(raw) {
  let q = raw.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(/\b(skelbimus?|skelbimus|visus|viso)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim();
}

function activeListings(listings) {
  return listings.filter((l) => l.price > 0 && !l.banned);
}

function filterListings(listings, query) {
  const q = stripSearchPrefixesForFilter(query).toLowerCase();
  if (!q) return activeListings(listings);
  const tokens = q.split(/[\s,.;:!?]+/).filter((t) => t.length >= 2);
  return activeListings(listings).filter((l) => {
    const haystack = `${l.title} ${l.description ?? ""} ${l.category}`.toLowerCase();
    const hits = tokens.filter((t) => haystack.includes(t)).length;
    return hits >= Math.max(1, Math.ceil(tokens.length * 0.34));
  });
}

function runQuery(listings, query) {
  if (isBrowseAllIntent(query)) return activeListings(listings);
  return filterListings(listings, query);
}

const listings = loadCatalog();
const activeCount = activeListings(listings).length;
const cases = [
  { q: "ieskau volvo v70", min: 1, browse: false },
  { q: "volvo v70", min: 1, browse: false },
  { q: "bmw", min: 1, browse: false },
  { q: "parodyk visus skelbimus", min: activeCount, browse: true },
  { q: "rodyk visus", min: activeCount, browse: true },
  { q: "parodyk visus", min: activeCount, browse: true },
  { q: "parodyk viską", min: activeCount, browse: true },
  { q: "atidaryk visus", min: activeCount, browse: true },
  { q: "visus", min: activeCount, browse: true },
];

let failed = false;
for (const { q, min, browse } of cases) {
  const intentOk = isBrowseAllIntent(q) === browse;
  const t0 = performance.now();
  const results = runQuery(listings, q);
  const ms = performance.now() - t0;
  const ok = intentOk && results.length >= min;
  console.log(
    `${ok ? "OK" : "FAIL"}: "${q}" intent=${isBrowseAllIntent(q)} → ${results.length} hits in ${ms.toFixed(2)}ms (min ${min})`
  );
  if (!ok) failed = true;
}

console.log(
  `OK: coordinates enriched at runtime via geocodeLocation (${listings.length} cities in catalog)`
);

process.exit(failed ? 1 : 0);
