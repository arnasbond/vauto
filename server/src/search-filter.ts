/** Stop words stripped before product token matching (sell/search verbs). */
const SEARCH_STOP_WORDS = new Set([
  "parduodu",
  "parduodami",
  "parduodama",
  "parduodamas",
  "parduoti",
  "parduod",
  "ieškau",
  "ieskau",
  "ieškoti",
  "ieskoti",
  "noriu",
  "norėčiau",
  "noreciau",
  "surask",
  "rask",
  "parodyk",
  "rodyti",
  "skelbimą",
  "skelbima",
  "skelbimus",
  "skelbimo",
  "man",
  "reikia",
  "reikėtų",
]);

export function extractProductSearchTokens(rawQuery: string): string[] {
  const q = rawQuery.toLowerCase().trim();
  if (!q) return [];
  return [
    ...new Set(
      q
        .split(/[\s,.;:!?—–-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !SEARCH_STOP_WORDS.has(t))
    ),
  ];
}

export function listingHaystack(listing: {
  title: string;
  description?: string | null;
  category?: string;
  tags?: string[];
  attributes?: Record<string, unknown> | null;
}): string {
  const attrs = listing.attributes ?? {};
  return [
    listing.title,
    listing.description ?? "",
    listing.category ?? "",
    ...(listing.tags ?? []),
    String(attrs.make ?? ""),
    String(attrs.model ?? ""),
    String(attrs.brand ?? ""),
    String(attrs.color ?? ""),
    String(attrs.clothingType ?? ""),
  ]
    .join(" ")
    .toLowerCase();
}

export function listingMatchesProductTokens(
  listing: {
    title: string;
    description?: string | null;
    category?: string;
    tags?: string[];
    attributes?: Record<string, unknown> | null;
  },
  rawQuery: string
): boolean {
  const tokens = extractProductSearchTokens(rawQuery);
  if (!tokens.length) return false;
  const haystack = listingHaystack(listing);
  return tokens.every((t) => haystack.includes(t));
}
