import type { Listing } from "@/lib/types";

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,.;:!?]+/)
    .filter((t) => t.length >= 2);
}

/** True when the query shares no meaningful tokens with any listing (e.g. „kosminis laivas“). */
export function isAbsurdSearchQuery(query: string, listings: Listing[]): boolean {
  const tokens = tokenizeQuery(query.trim());
  if (!tokens.length) return true;

  return !listings.some((listing) => {
    const haystack =
      `${listing.title} ${listing.description ?? ""} ${listing.category} ${(listing.tags ?? []).join(" ")}`.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });
}
