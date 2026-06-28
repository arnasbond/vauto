import type { Listing } from "@/lib/types";
import { ensureDemoCatalogListings } from "@/lib/merge-listings";

/** Demo seed IDs (lt-auto-001, lt-el-001, …) — ne vartotojo skelbimai. */
export function isDemoListingId(id: string): boolean {
  return /^lt-[a-z]+-\d+$/i.test(id) || id.startsWith("demo-");
}

export function markListingDemoFlags(listings: Listing[]): Listing[] {
  return listings.map((l) => ({
    ...l,
    isDemo: l.isDemo ?? isDemoListingId(l.id),
  }));
}

export function filterLiveFeedListings(listings: Listing[]): Listing[] {
  return listings.filter((l) => !l.isDemo);
}

/** Rodyti demo katalogą tik dev / explicit flag — ne prod feed'e. */
export function shouldShowDemoCatalog(): boolean {
  if (process.env.NEXT_PUBLIC_SHOW_DEMO_CATALOG === "true") return true;
  if (process.env.NEXT_PUBLIC_SHOW_DEMO_CATALOG === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function mergeListingsForClient(
  fromApi: Listing[],
  demos: Listing[]
): Listing[] {
  const api = markListingDemoFlags(fromApi);
  if (!shouldShowDemoCatalog()) {
    return filterLiveFeedListings(api);
  }
  return markListingDemoFlags(ensureDemoCatalogListings(api, markListingDemoFlags(demos)));
}
