/** Normalize user text to a clean product query — never inject synthetic „dalys“. */

import {
  inferUniversalListingCategory,
  isJobSearchQuery,
  jobSearchKeywordQuery,
} from "./universal-search-intent.js";

function stripSearchPrefixes(raw: string): string {
  return raw
    .replace(
      /^(?:ieškau|ieskau|rask|surask|parodyk|rodyk|noriu|find|search|show)\s+/i,
      ""
    )
    .trim();
}

export function normalizeProductSearchQuery(raw: string): string {
  const trimmed = raw.trim();
  if (isJobSearchQuery(trimmed)) {
    return jobSearchKeywordQuery(trimmed);
  }
  let q = stripSearchPrefixes(trimmed);
  q = q.replace(/\s+(auto\s+)?dalys$/i, "").trim();
  if (!q) return raw.trim();
  return q
    .split(/\s+/)
    .map((w) =>
      w.length <= 3
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ")
    .replace(/\bVolvo\b/i, "Volvo")
    .replace(/\bBmw\b/i, "BMW");
}

export function inferSearchCategory(query: string): string | undefined {
  return inferUniversalListingCategory(query);
}
