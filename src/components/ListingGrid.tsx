"use client";

import { useVauto } from "@/context/VautoContext";
import { SmartBrokerCard } from "@/components/broker/SmartBrokerCard";
import { VisualSearchStrip } from "@/components/search/VisualSearchStrip";
import { JobSearchPanel } from "@/components/jobs/JobSearchPanel";
import { VehicleSearchPanel } from "@/components/vehicle/VehicleSearchPanel";
import { RealEstateSearchPanel } from "@/components/real-estate/RealEstateSearchPanel";
import { ClothingSearchPanel } from "@/components/clothing/ClothingSearchPanel";
import { GeneralSearchPanel } from "@/components/general/GeneralSearchPanel";
import { ServiceSearchPanel } from "@/components/services/ServiceSearchPanel";
import { WantedEmptyState } from "@/components/wishlist/WantedEmptyState";
import { MarketplaceFilterBar } from "@/components/marketplace/MarketplaceFilterBar";
import {
  MarketplaceGridCard,
  MarketplaceListRow,
} from "@/components/marketplace/MarketplaceListingCards";
import { ListingMapView } from "@/components/marketplace/ListingMapView";
import { isAbsurdSearchQuery } from "@/lib/search-query-match";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { buildSmartBrokerSignal } from "@/lib/smart-broker";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";

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
  const {
    displayListings,
    fallbackListings,
    searchQuery,
    listings,
    viewMode,
    setViewMode,
    marketplaceFilters,
    setMarketplaceFilters,
  } = useVauto();

  const brokerSignal = buildSmartBrokerSignal(searchQuery, displayListings);
  const portal = portalExperienceForQuery(searchQuery);
  const theme = portal.theme;
  const ui = getPortalUi(theme);

  const renderListingCards = (items: typeof displayListings) => {
    if (viewMode === "map") {
      return (
        <div className="mt-3">
          <ListingMapView listings={items} />
        </div>
      );
    }
    if (viewMode === "list") {
      return (
        <div className="listing-card-row mt-1 divide-y divide-[var(--vauto-border)] rounded-2xl border border-[var(--vauto-border)] px-3">
          {items.map((listing) => (
            <MarketplaceListRow
              key={listing.id}
              listing={listing}
              priceColor={ui.price}
            />
          ))}
        </div>
      );
    }
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        {items.map((listing) => (
          <MarketplaceGridCard
            key={listing.id}
            listing={listing}
            priceColor={ui.price}
          />
        ))}
      </div>
    );
  };

  return (
    <section id="listing-results" aria-labelledby="listing-results-heading" className="py-2">
      <h2 id="listing-results-heading" className="sr-only">
        Paieškos rezultatai
      </h2>

      <MarketplaceFilterBar
        searchQuery={searchQuery}
        resultCount={displayListings.length}
        filters={marketplaceFilters}
        onFiltersChange={setMarketplaceFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {displayListings.length === 0 ? (
        <>
          {searchQuery.trim().length >= 3 && !hideEmptyAssistant ? (
            isAbsurdSearchQuery(searchQuery, listings) ? (
              <WantedEmptyState
                searchQuery={searchQuery}
                borderColor={ui.border}
                textMuted={ui.textMuted}
              />
            ) : (
              <p
                className="vauto-surface-panel mt-4 rounded-2xl border border-dashed p-6 text-center text-sm"
                style={{ borderColor: ui.border, color: ui.textMuted }}
              >
                Rezultatų nerasta. Pabandykite kitą paieškos frazę arba pašalinkite filtrus.
              </p>
            )
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
              <h3 className="mb-3 text-sm font-semibold text-[#111827]">
                Šių prekių yra kituose Lietuvos miestuose:
              </h3>
              {renderListingCards(fallbackListings)}
            </div>
          )}
        </>
      ) : (
        renderListingCards(displayListings)
      )}

      {theme === "autoplius" && displayListings.length > 0 && (
        <details className="vauto-surface-panel mt-6 rounded-lg border p-3 shadow-sm" style={{ borderColor: ui.border }}>
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: ui.accent }}>
            Išplėstinė automobilių paieška
          </summary>
          <div className="mt-3 [&>div]:mb-0">
            <VehicleSearchPanel />
          </div>
        </details>
      )}
      {theme === "cvbankas" && displayListings.length > 0 && <JobSearchPanel />}
      {theme === "aruodas" && displayListings.length > 0 && <RealEstateSearchPanel />}
      {theme === "wardrobe" && displayListings.length > 0 && <ClothingSearchPanel />}
      {theme === "skelbiu" && displayListings.length > 0 && <GeneralSearchPanel />}
      {theme === "paslaugos" && displayListings.length > 0 && <ServiceSearchPanel />}

      <VisualSearchStrip />

      {brokerSignal && <SmartBrokerCard signal={brokerSignal} />}
    </section>
  );
}
