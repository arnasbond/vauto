import type { Listing } from "@/lib/types";

/** API wins on ID conflict; demo catalog fills gaps when API seed is incomplete. */
export function mergeApiWithDemoCatalog(
  fromApi: Listing[],
  demos: Listing[]
): Listing[] {
  const byId = new Map(demos.map((d) => [d.id, d]));

  for (const item of fromApi) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }

  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
