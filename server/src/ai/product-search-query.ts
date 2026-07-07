/** Normalize user text to a clean product query — never inject synthetic „dalys“. */

function stripSearchPrefixes(raw: string): string {
  return raw
    .replace(
      /^(?:ieškau|ieskau|rask|surask|parodyk|rodyk|noriu|find|search|show)\s+/i,
      ""
    )
    .trim();
}

export function normalizeProductSearchQuery(raw: string): string {
  let q = stripSearchPrefixes(raw.trim());
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
  if (/\b(butas|namas|nt|sklyp)\b/i.test(query)) return "real_estate";
  if (/\b(batel|ked|sukn|drabuz|striuk)\b/i.test(query)) return "clothing";
  if (/\b(telefon|iphone|samsung|laptop|kompiuter)\b/i.test(query)) return "electronics";
  if (/\b(volvo|bmw|audi|v70|v60|auto|masin|transport)\b/i.test(query)) return "vehicles";
  return undefined;
}
