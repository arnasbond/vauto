"use client";
// @disk-refresh 2026-07-08T00:04 — supervisor DOM fixes

import { useState, useEffect, useRef } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { SmartBrokerCard } from "@/components/broker/SmartBrokerCard";
import { VisualSearchStrip } from "@/components/search/VisualSearchStrip";
import { WantedEmptyState } from "@/components/wishlist/WantedEmptyState";
import { MarketplaceFilterBar } from "@/components/marketplace/MarketplaceFilterBar";
import { AiInterpretationChips } from "@/components/marketplace/AiInterpretationChips";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { ListingGridSkeleton } from "@/components/marketplace/ListingCardSkeleton";
import { ListingMapView } from "@/components/marketplace/ListingMapView";
import { isAbsurdSearchQuery } from "@/lib/search-query-match";
import { agentHasSupervisorReply } from "@/lib/agent-chat-layout";
import { resolveBrowseAllIntent } from "@/lib/browse-all-intent";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useCanonicalFacetQuery } from "@/hooks/useCanonicalFacetUrl";
import { getVerticalUi } from "@/lib/vertical-presentation";
import { buildSmartBrokerSignal } from "@/lib/smart-broker";
import { verticalExperienceForQuery } from "@/lib/vertical-presentation";
import { interpretAiFacets } from "@/lib/ai-facet-interpretation";
import { enabledViewModesForVertical } from "@/lib/vertical-presentation-contract";
import { effectiveViewMode } from "@/lib/marketplace-view";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { VerticalPresentationId } from "@/lib/vertical-presentation";
import { cn } from "@/lib/cn";
import {
  NATIVE_GRID_INITIAL,
  NATIVE_GRID_STEP,
  shouldLimitNativeFeed,
} from "@/lib/native-perf";

function emptyMessage(vertical: VerticalPresentationId): string {
  switch (vertical) {
    case "jobs":
      return "Darbo skelbimų nerasta. Pabandykite kitą raktinį žodį ar miestą.";
    case "transport":
      return "Transporto skelbimų nerasta. Pabandykite kitą frazę ar miestą.";
    case "real_estate":
      return "NT skelbimų nerasta. Pabandykite kitą tipą ar miestą.";
    case "fashion":
      return "Drabužių nerasta. Pabandykite kitą dydį ar prekės ženklą.";
    case "goods":
      return "Skelbimų nerasta. Pabandykite kitą kategoriją ar miestą.";
    case "services":
      return "Paslaugų teikėjų nerasta. Pabandykite kitą specialybę ar miestą.";
    default:
      return "Tiesioginių skelbimų dar nėra. Patikslinkite paiešką arba įtraukite prekę į pageidavimų sąrašą.";
  }
}

export function ListingGrid({ hideEmptyAssistant = false }: { hideEmptyAssistant?: boolean }) {
  const { displayListings, fallbackListings, listings } = useVauto();
  const { messages, busy: agentBusy } = useVautoAgent();
  const {
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    viewModeExplicit,
    marketplaceFilters,
    setMarketplaceFilters,
    searchLoading,
  } = useVautoSearch();
  const nativeLimited = shouldLimitNativeFeed();
  const [nativeVisible, setNativeVisible] = useState(NATIVE_GRID_INITIAL);

  // Stage 22A.1-A — the responsive automatic default: on narrow viewports
  // (mobile) with NO explicit user/AI view selection, present the safe
  // single-column LIST instead of the dense 2-column GRID. This is render-time
  // only — the canonical viewMode/URL stay untouched, so resizing alone never
  // corrupts persisted view state. An explicit selection always wins.
  const isMobile = useIsMobile();
  const effectiveMode = effectiveViewMode(viewMode, viewModeExplicit, isMobile);

  // Stage 22A-5 + 22A.1-D CASE 4 — a vertical with MAP NOT_APPLICABLE must
  // NEVER render the map, even for one frame after a vertical switch. The
  // canonical state fallback (useEffect below) eventually lands on the safe
  // default, but render-time capability gating prevents any transient empty
  // map shell: if the active canonical vertical disables map, the render mode
  // falls back to the responsive default (LIST on mobile, grid elsewhere).
  const { query: facetQuery } = useCanonicalFacetQuery();
  const mapCapabilityEnabled = enabledViewModesForVertical(facetQuery.verticalId).find(
    (v) => v.mode === "map"
  )?.enabled;
  const renderMode =
    effectiveMode === "map" && mapCapabilityEnabled === false
      ? isMobile
        ? "list"
        : "grid"
      : effectiveMode;

  useEffect(() => {
    if (viewMode !== "map") return;
    if (mapCapabilityEnabled === false) {
      setViewMode("grid", { explicit: false });
    }
  }, [viewMode, mapCapabilityEnabled, setViewMode]);

  // Stage 18A — keep the interpretation chips mounted across transient blanks of
  // the canonical `searchQuery`. The agent applying a search action internally
  // sets `searchQuery("")` to clear the box; holding the last meaningful query
  // here prevents the AI readout from flickering/unmounting, while a genuinely
  // new committed query always refreshes it.
  const heldQueryRef = useRef(searchQuery);
  const effectiveSearchQuery =
    searchQuery.trim().length > 0
      ? ((heldQueryRef.current = searchQuery), searchQuery)
      : heldQueryRef.current;

  useEffect(() => {
    setNativeVisible(NATIVE_GRID_INITIAL);
  }, [searchQuery, displayListings.length]);

  const sliceForNative = (items: typeof displayListings) => {
    if (!nativeLimited) return items;
    return items.slice(0, nativeVisible);
  };

  // Stage 18D/18F — vertical for adaptive card composition. Prefer the vertical
  // derived from the active AI interpretation of the query (deterministic local
  // adapter) so real-estate/jobs get the correct adaptive grid even when the
  // agent applies a generic result that momentarily resets the canonical
  // category. Fall back to the canonical filter category otherwise.
  const interpretedVertical = searchQuery.trim().length >= 3
    ? interpretAiFacets(effectiveSearchQuery).vertical
    : ("all" as const);
  const activeVertical =
    interpretedVertical !== "all" ? interpretedVertical : marketplaceFilters.category ?? "all";

  const brokerSignal = buildSmartBrokerSignal(searchQuery, displayListings);
  const experience = verticalExperienceForQuery(searchQuery);
  const vertical = experience.vertical;
  const ui = getVerticalUi(vertical);
  const browseAllActive = resolveBrowseAllIntent(searchQuery);
  const supervisorContext = agentBusy || agentHasSupervisorReply(messages);

  // 21D-3 — zero-result recovery: clear restrictive criteria (location/price/
  // attributes) while keeping the committed query so results recompute
  // immediately. Writes the canonical MarketplaceFilterState only — no second
  // state model, no AI involvement.
  const broadenSearch = () => {
    setMarketplaceFilters({
      ...marketplaceFilters,
      location: "",
      radiusKm: null,
      priceMin: null,
      priceMax: null,
      condition: "all",
      categoryAttributes: {},
    });
  };

  const renderListingCards = (items: typeof displayListings, showLoadMore = false) => {
    const visible = sliceForNative(items);
    const hasMore = nativeLimited && items.length > visible.length;

    const loadMore =
      showLoadMore && hasMore ? (
        <button
          type="button"
          onClick={() => setNativeVisible((n) => n + NATIVE_GRID_STEP)}
          className="mt-4 w-full rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-teal)]/5 py-3 text-sm font-medium text-[var(--vauto-teal)] transition hover:bg-[var(--vauto-teal)]/10"
        >
          Rodyti daugiau ({items.length - visible.length} liko)
        </button>
      ) : null;

    if (renderMode === "map") {
      return (
        <div className="mt-3">
          <ListingMapView listings={visible} />
          {loadMore}
        </div>
      );
    }
    if (renderMode === "list") {
      return (
        <>
          <div className="listing-card-row mt-1 space-y-2">
            {visible.map((listing, index) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                layout="list"
                priceColor="var(--ds-brand, var(--vauto-ink))"
                priority={index === 0}
              />
            ))}
          </div>
          {loadMore}
        </>
      );
    }
    return (
      <>
        {/* Stage 18F — vertical-aware responsive grid: real estate & jobs use a
            single column on small phones (390–430px) so photo/title/price/place
            stay readable in 1–2s; goods/vehicles keep the denser 2-col layout. */}
        <div
          data-listing-grid
          data-grid-vertical={activeVertical}
          className={cn(
            "mt-3 grid gap-3 sm:gap-4",
            activeVertical === "real_estate" || activeVertical === "jobs"
              ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
              : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4"
          )}
        >
          {visible.map((listing, index) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              layout="grid"
              priceColor="var(--ds-brand, var(--vauto-ink))"
              priority={index === 0}
            />
          ))}
        </div>
        {loadMore}
      </>
    );
  };

  return (
    <section id="listing-results" aria-labelledby="listing-results-heading" className="py-2">
      <h2 id="listing-results-heading" className="sr-only">
        Paieškos rezultatai
      </h2>

      <div className="md:hidden">
        <MarketplaceFilterBar
          searchQuery={searchQuery}
          resultCount={displayListings.length}
          filters={marketplaceFilters}
          onFiltersChange={setMarketplaceFilters}
          viewMode={viewMode}
          viewModeExplicit={viewModeExplicit}
          onViewModeChange={setViewMode}
          surface="mobile"
        />
      </div>

      {effectiveSearchQuery.trim().length > 0 && (
        <AiInterpretationChips
          searchQuery={effectiveSearchQuery}
          filters={marketplaceFilters}
          onFiltersChange={setMarketplaceFilters}
          onQueryChange={setSearchQuery}
        />
      )}

      {searchLoading ? (
        <ListingGridSkeleton
          count={renderMode === "list" ? 6 : 8}
          layout={renderMode === "list" ? "list" : "grid"}
        />
      ) : displayListings.length === 0 ? (
        <>
          {!browseAllActive &&
          searchQuery.trim().length >= 3 &&
          !hideEmptyAssistant &&
          !supervisorContext ? (
            isAbsurdSearchQuery(searchQuery, listings) ? (
              <WantedEmptyState
                searchQuery={searchQuery}
                borderColor={ui.border}
                textMuted={ui.textMuted}
                onBroaden={broadenSearch}
              />
            ) : null
          ) : searchQuery.trim().length < 3 ? (
            <p
              className="vauto-surface-panel mt-4 rounded-2xl border border-dashed p-6 text-center text-sm"
              style={{ borderColor: ui.border, color: ui.textMuted }}
            >
              {emptyMessage(vertical)}
            </p>
          ) : null}

          {/* 21D-3 — a zero-result state with restrictive criteria must never be
              a dead end: always offer a deterministic broaden action. */}
          {!isAbsurdSearchQuery(searchQuery, listings) &&
            searchQuery.trim().length >= 3 && (
              <button
                type="button"
                onClick={broadenSearch}
                className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--vauto-border-input)] px-4 py-2.5 text-sm font-medium text-[var(--vauto-text-heading)] transition hover:bg-[var(--vauto-surface-page)]"
              >
                Platesnė paieška
              </button>
            )}

          {fallbackListings.length > 0 && (
            <div className="mt-6">
              <h3 className="vauto-layout-label mb-3 text-sm text-gray-800">
                Šių prekių yra kituose Lietuvos miestuose:
              </h3>
              {renderListingCards(fallbackListings)}
            </div>
          )}
        </>
      ) : (
        <>
          {searchQuery.trim().length < 3 && (
            <div className="mb-4 flex items-center gap-2.5">
              <h3 className="vauto-layout-heading font-[family-name:var(--font-outfit)] text-lg font-bold text-[var(--vauto-ink)]">
                Naujausi skelbimai
              </h3>
              <span className="rounded-full bg-[var(--vauto-surface-page)] px-2.5 py-0.5 text-xs font-medium text-[var(--vauto-body)]">
                {displayListings.length} skelbimų
              </span>
            </div>
          )}
          {renderListingCards(displayListings, true)}
        </>
      )}

      <VisualSearchStrip />

      {brokerSignal && <SmartBrokerCard signal={brokerSignal} />}
    </section>
  );
}
