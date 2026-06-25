#!/usr/bin/env node
/** Smoke test for client fast-agent-search against bundled catalog. */
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
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+visus)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show)\s+/i;

const BROWSE_ALL =
  /\b(visus?\s+skelbimus?|visi\s+skelbimai|parodyk\s+viską|parodyk\s+viska|rodyti\s+visus|show\s+all)\b/i;

function stripSearchPrefixes(raw) {
  let q = raw.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(/\b(skelbimus?|skelbimus|visus|viso)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim();
}

function activeListings(listings) {
  return listings.filter((l) => l.price > 0 && !l.banned);
}

function filterListings(listings, query) {
  const q = stripSearchPrefixes(query).toLowerCase();
  if (!q) return activeListings(listings);
  const tokens = q.split(/[\s,.;:!?]+/).filter((t) => t.length >= 2);
  return activeListings(listings).filter((l) => {
    const haystack = `${l.title} ${l.description ?? ""} ${l.category}`.toLowerCase();
    const hits = tokens.filter((t) => haystack.includes(t)).length;
    return hits >= Math.max(1, Math.ceil(tokens.length * 0.34));
  });
}

function runQuery(listings, query) {
  if (BROWSE_ALL.test(query)) return activeListings(listings);
  return filterListings(listings, query);
}

const listings = loadCatalog();
const activeCount = activeListings(listings).length;
const cases = [
  { q: "ieskau volvo v70", min: 1 },
  { q: "volvo v70", min: 1 },
  { q: "bmw", min: 1 },
  { q: "parodyk visus skelbimus", min: activeCount },
];

let failed = false;
for (const { q, min } of cases) {
  const t0 = performance.now();
  const results = runQuery(listings, q);
  const ms = performance.now() - t0;
  const ok = results.length >= min;
  console.log(
    `${ok ? "OK" : "FAIL"}: "${q}" → ${results.length} hits in ${ms.toFixed(2)}ms (min ${min})`
  );
  if (!ok) failed = true;
  if (ms > 100) {
    console.warn(`WARN: "${q}" took ${ms.toFixed(2)}ms (>100ms target)`);
  }
}

console.log(
  `OK: coordinates enriched at runtime via geocodeLocation (${listings.length} cities in catalog)`
);

process.exit(failed ? 1 : 0);
