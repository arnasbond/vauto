"use client";
// @disk-refresh 2026-07-08T00:04 — supervisor DOM fixes

import { useState, useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { SmartBrokerCard } from "@/components/broker/SmartBrokerCard";
import { VisualSearchStrip } from "@/components/search/VisualSearchStrip";
import { WantedEmptyState } from "@/components/wishlist/WantedEmptyState";
import { MarketplaceFilterBar } from "@/components/marketplace/MarketplaceFilterBar";
import {
  MarketplaceGridCard,
  MarketplaceListRow,
} from "@/components/marketplace/MarketplaceListingCards";
import { ListingMapView } from "@/components/marketplace/ListingMapView";
import { isAbsurdSearchQuery } from "@/lib/search-query-match";
import { agentHasSupervisorReply } from "@/lib/agent-chat-layout";
import { resolveBrowseAllIntent } from "@/lib/browse-all-intent";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { buildSmartBrokerSignal } from "@/lib/smart-broker";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import {
  NATIVE_GRID_INITIAL,
  NATIVE_GRID_STEP,
  shouldLimitNativeFeed,
} from "@/lib/native-perf";

function emptyMessage(theme: ChameleonThemeId): string {
  switch (theme) {
    case "cvbankas":
      return "Darbo skelbimų nerasta. Pabandykite kitą raktinį žodį ar miestą.";
    case "autoplius":
      return "Automobilių nerasta. Pabandykite kitą markę ar miestą.";
    case "aruodas":
      return "NT skelbimų nerasta. Pabandykite kitą tipą ar miestą.";
    case "wardrobe":
      return "Drabužių nerasta. Pabandykite kitą dydį ar prekės ženklą.";
    case "skelbiu":
      return "Skelbimų nerasta. Pabandykite kitą kategoriją ar miestą.";
    case "paslaugos":
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
    viewMode,
    setViewMode,
    marketplaceFilters,
    setMarketplaceFilters,
    searchLoading,
  } = useVautoSearch();

  const nativeLimited = shouldLimitNativeFeed();
  const [nativeVisible, setNativeVisible] = useState(NATIVE_GRID_INITIAL);

  useEffect(() => {
    setNativeVisible(NATIVE_GRID_INITIAL);
  }, [searchQuery, displayListings.length]);

  const sliceForNative = (items: typeof displayListings) => {
    if (!nativeLimited) return items;
    return items.slice(0, nativeVisible);
  };

  const brokerSignal = buildSmartBrokerSignal(searchQuery, displayListings);
  const portal = portalExperienceForQuery(searchQuery);
  const theme = portal.theme;
  const ui = getPortalUi(theme);
  const browseAllActive = resolveBrowseAllIntent(searchQuery);
  const supervisorContext = agentBusy || agentHasSupervisorReply(messages);

  const renderListingCards = (items: typeof displayListings, showLoadMore = false) => {
    const visible = sliceForNative(items);
    const hasMore = nativeLimited && items.length > visible.length;

    const loadMore =
      showLoadMore && hasMore ? (
        <button
          type="button"
          onClick={() => setNativeVisible((n) => n + NATIVE_GRID_STEP)}
          className="mt-4 w-full rounded-2xl border border-[var(--vauto-border)] bg-white/5 py-3 text-sm font-medium text-[var(--vauto-teal)]"
        >
          Rodyti daugiau ({items.length - visible.length} liko)
        </button>
      ) : null;

    if (viewMode === "map") {
      return (
        <div className="mt-3">
          <ListingMapView listings={visible} />
          {loadMore}
        </div>
      );
    }
    if (viewMode === "list") {
      return (
        <>
          <div className="listing-card-row mt-1 divide-y divide-[var(--vauto-border)] rounded-2xl border border-[var(--vauto-border)] px-3">
            {visible.map((listing) => (
              <MarketplaceListRow
                key={listing.id}
                listing={listing}
                priceColor={ui.price}
              />
            ))}
          </div>
          {loadMore}
        </>
      );
    }
    return (
      <>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((listing) => (
            <MarketplaceGridCard
              key={listing.id}
              listing={listing}
              priceColor={ui.price}
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
          onViewModeChange={setViewMode}
        />
      </div>

      {searchLoading ? (
        <p
          className="vauto-surface-panel mt-4 rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: ui.border, color: ui.textMuted }}
        >
          Ieškoma…
        </p>
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
              />
            ) : null
          ) : searchQuery.trim().length < 3 ? (
            <p
              className="vauto-surface-panel mt-4 rounded-2xl border border-dashed p-6 text-center text-sm"
              style={{ borderColor: ui.border, color: ui.textMuted }}
            >
              {emptyMessage(theme)}
            </p>
          ) : null}

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
              <h3 className="vauto-layout-heading text-lg text-gray-900">Naujausi skelbimai</h3>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
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
