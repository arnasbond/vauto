import { LITHUANIA_MOCK_CATALOG } from "@/data/lithuania-mock-catalog";
import {
  applyCategoryAttributeFilters,
  categoryFilterFieldsFor,
} from "@/lib/category-attribute-filters";
import { applyMarketplaceFilters, DEFAULT_MARKETPLACE_FILTERS } from "@/lib/marketplace-view";
import { buildDisplayListings } from "@/lib/display-listings-pipeline";
import type { Listing, ScoredListing } from "@/lib/types";

function asScored(listings: Listing[]): ScoredListing[] {
  return listings.map((l) => ({
    ...l,
    score: 1,
    semanticRelevance: 1,
    proximityScore: 1,
    priceAttractiveness: 1,
    recencyScore: 1,
  }));
}

export interface DiagnosticResult {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  ms?: number;
}

function timed<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  return { result, ms: Math.round(performance.now() - start) };
}

/** Automatinė visos Lietuvos sistemos diagnostika (pro/admin). */
export async function runNationwideDiagnostics(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  const { result: cityCount, ms: cityMs } = timed(() => {
    const cities = new Set(
      LITHUANIA_MOCK_CATALOG.map((l) =>
        String(l.location ?? "")
          .split(",")[0]
          ?.trim()
      ).filter(Boolean)
    );
    return cities.size;
  });
  results.push({
    id: "catalog-cities",
    label: "Visos Lietuvos miestų katalogas",
    ok: cityCount >= 20 && LITHUANIA_MOCK_CATALOG.length >= 100,
    detail: `${LITHUANIA_MOCK_CATALOG.length} skelbimų · ${cityCount} unikalių miestų`,
    ms: cityMs,
  });

  const sampleVehicle = LITHUANIA_MOCK_CATALOG.find(
    (l) => l.category === "vehicles" && l.attributes?.year
  ) as Listing | undefined;

  const { result: filterOk, ms: filterMs } = timed(() => {
    if (!sampleVehicle) return false;
    const year = String(sampleVehicle.attributes?.year ?? "");
    const filtered = applyCategoryAttributeFilters(
      [sampleVehicle],
      "vehicles",
      { yearFrom: year.slice(0, 4) }
    );
    return filtered.length === 1;
  });
  results.push({
    id: "deep-filters",
    label: "Giliojo filtravimo pipeline",
    ok: filterOk && categoryFilterFieldsFor("vehicles").length > 5,
    detail: filterOk
      ? "Metų/ridos filtrai sutampa su wizard atributais"
      : "Filtrų testas nepavyko — patikrinkite category-attribute-filters",
    ms: filterMs,
  });

  const { result: pipelineCount, ms: pipeMs } = timed(() => {
    const out = buildDisplayListings({
      visibleListings: asScored(LITHUANIA_MOCK_CATALOG as Listing[]),
      marketplaceFilters: { ...DEFAULT_MARKETPLACE_FILTERS, category: "all" },
      buyerCoords: null,
      activeFilterIds: new Set(),
      dynamicFilters: [],
      agentPinnedListingIds: null,
      searchQuery: "",
      visualSearchProfile: null,
      visualRankScores: {},
    });
    return out.listings.length + out.fallbackListings.length;
  });
  results.push({
    id: "display-pipeline",
    label: "display-listings-pipeline",
    ok: pipelineCount > 0,
    detail: `${pipelineCount} skelbimų per pipeline (nacionalinis režimas)`,
    ms: pipeMs,
  });

  const { result: geoOk, ms: geoMs } = timed(() => {
    const filtered = applyMarketplaceFilters(
      asScored(LITHUANIA_MOCK_CATALOG as Listing[]),
      { ...DEFAULT_MARKETPLACE_FILTERS, category: "all", location: "" },
      null
    );
    return filtered.length === LITHUANIA_MOCK_CATALOG.length;
  });
  results.push({
    id: "nationwide-geo",
    label: "Nacionalinis geografinis režimas",
    ok: geoOk,
    detail: geoOk
      ? "Be regioninio filtro rodomi visi LT skelbimai"
      : "Geo filtras per siauras",
    ms: geoMs,
  });

  const sitemapStart = performance.now();
  let sitemapOk = false;
  let sitemapDetail = "Nepavyko pasiekti sitemap.xml";
  try {
    const res = await fetch("/sitemap.xml", { cache: "no-store" });
    const text = await res.text();
    const urlCount = (text.match(/<loc>/g) ?? []).length;
    sitemapOk = res.ok && urlCount >= 100;
    sitemapDetail = sitemapOk
      ? `${urlCount} URL sitemap.xml`
      : `HTTP ${res.status}, ${urlCount} URL`;
  } catch (e) {
    sitemapDetail = e instanceof Error ? e.message : "Tinklo klaida";
  }
  results.push({
    id: "sitemap",
    label: "sitemap.xml generatorius",
    ok: sitemapOk,
    detail: sitemapDetail,
    ms: Math.round(performance.now() - sitemapStart),
  });

  return results;
}
