import type { Listing } from "@/lib/types";

function sortByNewest(items: Listing[]): Listing[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** API wins on ID conflict; demo catalog always fills gaps when API seed is incomplete. */
export function mergeApiWithDemoCatalog(
  fromApi: Listing[],
  demos: Listing[]
): Listing[] {
  const byId = new Map(demos.map((d) => [d.id, d]));
  const seenSlugs = new Set(
    demos.map((d) => d.slug).filter((s): s is string => Boolean(s))
  );

  for (const item of fromApi) {
    if (
      item.slug &&
      seenSlugs.has(item.slug) &&
      !byId.has(item.id)
    ) {
      continue;
    }

    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
    if (item.slug) seenSlugs.add(item.slug);
  }

  return sortByNewest(Array.from(byId.values()));
}

/** Never return an empty feed when the bundled demo catalog exists. */
export function ensureDemoCatalogListings(
  listings: Listing[],
  demos: Listing[]
): Listing[] {
  const merged = mergeApiWithDemoCatalog(listings, demos);
  if (merged.length > 0) return merged;
  return demos.length > 0 ? sortByNewest(demos) : listings;
}
