"use client";



import { AppShell } from "@/components/AppShell";

import { Header } from "@/components/Header";

import { SearchBar } from "@/components/SearchBar";

import { ListingGrid } from "@/components/ListingGrid";

import { HeroSection, ContentSection } from "@/components/HeroSection";

import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";

import { AiFirstBrowsePrompt } from "@/components/search/AiFirstBrowsePrompt";

import { HomeAiHero } from "@/components/home/HomeAiHero";

import { SearchAiResultsPanel } from "@/components/home/SearchAiResultsPanel";

import { ZeroUiListingPreview } from "@/components/zero-ui/ZeroUiListingPreview";

import { ZeroUiBusinessDashboard } from "@/components/zero-ui/ZeroUiBusinessDashboard";

import { ZeroUiAdminPanel } from "@/components/zero-ui/ZeroUiAdminPanel";

import { ZeroUiViewTransition } from "@/components/zero-ui/ZeroUiViewTransition";

import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";

import { useVauto } from "@/context/VautoContext";

import type { ZeroUiScreen } from "@/lib/zero-ui-screens";

import { useCallback, useEffect, useState } from "react";

import { HomeWardrobeSecretary } from "@/components/home/HomeWardrobeSecretary";
import { SearchEmptyAssistantBanner } from "@/components/search/SearchEmptyAssistantBanner";

import { SearchResultsFocus } from "@/components/search/SearchResultsFocus";
import { subscribeHomeReset } from "@/lib/home-reset";



function MarketplaceView() {

  const { searchQuery, sellerStep, rankedListings, searchLoading } = useVauto();

  const [seedQuery, setSeedQuery] = useState<string | null>(null);

  const inSellerFlow = sellerStep !== "idle";
  const hasSearch = searchQuery.trim().length >= 3;

  const emptySearchMode = hasSearch && rankedListings.length === 0 && !searchLoading;



  const handleSearchPrompt = useCallback((prompt: string) => {

    setSeedQuery(prompt);

  }, []);

  useEffect(() => {
    return subscribeHomeReset(() => setSeedQuery(null));
  }, []);



  return (

    <>

      <SearchResultsFocus />

      <HeroSection>

        <PortalPageChrome
          minimal
          header={
            <>
              {inSellerFlow ? (
                <>
                  <Header />
                  <div className="mt-3">
                    <SearchBar />
                  </div>
                </>
              ) : (
                <HomeAiHero
                  compact={hasSearch}
                  showQuickActions={!hasSearch}
                  seedQuery={seedQuery}
                  onSeedConsumed={() => setSeedQuery(null)}
                  onSearchPrompt={handleSearchPrompt}
                />
              )}
              {emptySearchMode && (
                <SearchEmptyAssistantBanner searchQuery={searchQuery.trim()} />
              )}
            </>
          }
        >
          <span className="sr-only">VAUTO pagrindinis puslapis</span>
        </PortalPageChrome>

      </HeroSection>



      <ContentSection>

        {!hasSearch && <HomeWardrobeSecretary />}

        {hasSearch && !emptySearchMode && (

          <SearchAiResultsPanel onFollowUp={handleSearchPrompt} />

        )}



        <div id="browse-section" className="scroll-mt-24">

          <AiFirstBrowsePrompt />

        </div>



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


