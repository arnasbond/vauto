"use client";



import { AppShell } from "@/components/AppShell";

import { Header } from "@/components/Header";

import { SearchBar } from "@/components/SearchBar";

import { ListingGrid } from "@/components/ListingGrid";

import { HeroSection, ContentSection } from "@/components/HeroSection";

import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";

import { MarketplaceCategoryGrid } from "@/components/MarketplaceCategoryGrid";

import { ZeroUiListingPreview } from "@/components/zero-ui/ZeroUiListingPreview";

import { ZeroUiBusinessDashboard } from "@/components/zero-ui/ZeroUiBusinessDashboard";

import { ZeroUiAdminPanel } from "@/components/zero-ui/ZeroUiAdminPanel";

import { ZeroUiViewTransition } from "@/components/zero-ui/ZeroUiViewTransition";

import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";

import { useVauto } from "@/context/VautoContext";

import { portalExperienceForQuery } from "@/lib/portal-experience";

import type { ZeroUiScreen } from "@/lib/zero-ui-screens";

import { useCallback } from "react";

import { SearchEmptyAssistantBanner } from "@/components/search/SearchEmptyAssistantBanner";

import { SearchResultsFocus } from "@/components/search/SearchResultsFocus";



function DefaultHero() {

  return (

    <div className="vauto-dashboard-card mb-5 mt-1 rounded-2xl p-4 shadow-sm">

      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-primary)]">

        VAUTO Zero-UI

      </p>

      <h1 className="font-display mt-2 text-[1.65rem] font-extrabold leading-[1.08] tracking-tight text-[var(--vauto-text-main)] sm:text-[1.875rem]">

        Ieškok. Rask. Įdėk.

      </h1>

      <p className="mt-2 text-[13px] leading-snug text-[var(--vauto-text-muted)]">

        Rašykite paiešką viršuje arba spauskite + apačioje, kad įkeltumėte skelbimą.

      </p>

    </div>

  );

}



function MarketplaceView() {

  const { searchQuery, sellerStep, rankedListings, searchLoading } = useVauto();

  const inSellerFlow = sellerStep !== "idle";

  const portalActive = Boolean(searchQuery.trim()) || inSellerFlow;

  const isFluxHome = !portalActive || portalExperienceForQuery(searchQuery).theme === "flux";

  const emptySearchMode =

    Boolean(searchQuery.trim().length >= 3) &&

    rankedListings.length === 0 &&

    !searchLoading;



  return (

    <>

      <SearchResultsFocus />

      <HeroSection>

        <PortalPageChrome

          minimal={portalActive}

          header={

            <>

              <Header />

              <div className="mt-3">

                <SearchBar />

              </div>

              {emptySearchMode && (

                <SearchEmptyAssistantBanner searchQuery={searchQuery.trim()} />

              )}

            </>

          }

        >

          {isFluxHome && !emptySearchMode && <DefaultHero />}

        </PortalPageChrome>

      </HeroSection>



      <ContentSection>

        {!emptySearchMode && <MarketplaceCategoryGrid />}

        <div>

          <ListingGrid hideEmptyAssistant={emptySearchMode} />

        </div>

      </ContentSection>

    </>

  );

}



export default function HomePage() {

  const { currentView } = useZeroUiScreen();



  const renderView = useCallback((view: ZeroUiScreen) => {

    switch (view) {

      case "marketplace":

        return <MarketplaceView />;

      case "listing_preview":

        return <ZeroUiListingPreview />;

      case "business_dashboard":

        return <ZeroUiBusinessDashboard />;

      case "admin_panel":

        return <ZeroUiAdminPanel />;

    }

  }, []);



  return (

    <AppShell>

      <ZeroUiViewTransition view={currentView} renderView={renderView} />

    </AppShell>

  );

}


