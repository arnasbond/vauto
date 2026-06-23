import type { Listing } from "@/lib/types";

/** When live API has enough listings, skip demo noise in search results. */
const DEMO_MERGE_THRESHOLD = 10;

/** API wins on ID conflict; demo catalog fills gaps when API seed is incomplete. */
export function mergeApiWithDemoCatalog(
  fromApi: Listing[],
  demos: Listing[]
): Listing[] {
  if (fromApi.length >= DEMO_MERGE_THRESHOLD) {
    return [...fromApi].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
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

  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
