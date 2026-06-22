import type { Listing } from "@/lib/types";

export interface SearchIntentEvent {
  query: string;
  timestamp: string;
}

const MAX_EVENTS = 200;

export function recordSearchIntent(
  events: SearchIntentEvent[],
  query: string
): SearchIntentEvent[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return events;
  const next = [
    { query: q, timestamp: new Date().toISOString() },
    ...events,
  ].slice(0, MAX_EVENTS);
  return next;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?—–-]+/)
    .filter((t) => t.length >= 3);
}

function listingMatchesQuery(listing: Listing, query: string): boolean {
  const tokens = tokenize(query);
  if (!tokens.length) return false;
  const haystack = [
    listing.title,
    listing.location,
    listing.category,
    ...listing.tags,
    listing.description ?? "",
    ...Object.entries(listing.attributes ?? {}).flatMap(([key, value]) => [
      key,
      ...(Array.isArray(value) ? value : value ? [value] : []),
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

/** How many unique searches in last 7 days relate to seller's active listings */
export function countBuyerIntentForSeller(
  events: SearchIntentEvent[],
  listings: Listing[]
): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = events.filter(
    (e) => new Date(e.timestamp).getTime() >= weekAgo
  );
  const active = listings.filter((l) => l.status !== "sold" && !l.banned);
  if (!active.length || !recent.length) return 0;

  const matchedQueries = new Set<string>();
  for (const event of recent) {
    if (active.some((l) => listingMatchesQuery(l, event.query))) {
      matchedQueries.add(event.query);
    }
  }
  return matchedQueries.size;
}

export function getPopularListingIds(
  listings: Listing[],
  limit = 3
): string[] {
  return [...listings]
    .filter((l) => l.status !== "sold" && !l.banned)
    .sort((a, b) => {
      const scoreA =
        (a.views ?? 0) +
        (a.callClicks ?? 0) * 3 +
        (a.chatStarts ?? 0) * 2 +
        (a.saveCount ?? 0) * 2;
      const scoreB =
        (b.views ?? 0) +
        (b.callClicks ?? 0) * 3 +
        (b.chatStarts ?? 0) * 2 +
        (b.saveCount ?? 0) * 2;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, limit)
    .map((l) => l.id);
}
