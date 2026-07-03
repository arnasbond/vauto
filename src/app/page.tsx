"use client";



import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { DesktopHomeLayout } from "@/components/layout/desktop/DesktopHomeLayout";
import { useLayoutMode } from "@/context/LayoutModeContext";

import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";

import { ListingGrid } from "@/components/ListingGrid";

import { HeroSection, ContentSection } from "@/components/HeroSection";

import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";

import { AiFirstBrowsePrompt } from "@/components/search/AiFirstBrowsePrompt";
import { HomeAiHero } from "@/components/home/HomeAiHero";


import { ZeroUiListingPreview } from "@/components/zero-ui/ZeroUiListingPreview";

import { ZeroUiBusinessDashboard } from "@/components/zero-ui/ZeroUiBusinessDashboard";

import { ZeroUiAdminPanel } from "@/components/zero-ui/ZeroUiAdminPanel";

import { ZeroUiViewTransition } from "@/components/zero-ui/ZeroUiViewTransition";

import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useSellerFlow } from "@/context/SellerFlowContext";

import type { ZeroUiScreen } from "@/lib/zero-ui-screens";

import { useCallback, useEffect, useState } from "react";

import { SearchEmptyAssistantBanner } from "@/components/search/SearchEmptyAssistantBanner";

import { SearchResultsFocus } from "@/components/search/SearchResultsFocus";
import { subscribeHomeReset } from "@/lib/home-reset";



function MarketplaceView() {

  const { rankedListings } = useVauto();
  const { sellerStep } = useSellerFlow();
  const { searchQuery, searchLoading } = useVautoSearch();
  const { isDesktop } = useLayoutMode();

  const [seedQuery, setSeedQuery] = useState<string | null>(null);

  const inSellerFlow = sellerStep !== "idle";
  const hasSearch = searchQuery.trim().length >= 3;

  const emptySearchMode = hasSearch && rankedListings.length === 0 && !searchLoading;

  useEffect(() => {
    return subscribeHomeReset(() => setSeedQuery(null));
  }, []);

  const heroBlock = (
    <PortalPageChrome
      minimal
      header={
        <>
          {inSellerFlow ? (
            <TopAiCommandChrome
              sticky={false}
              className="mb-0 border-none bg-transparent px-0 pb-0 pt-0 backdrop-blur-none"
            />
          ) : (
            <HomeAiHero
              compact={hasSearch}
              seedQuery={seedQuery}
              onSeedConsumed={() => setSeedQuery(null)}
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
  );

  const browseSection = (
    <>
      {!hasSearch && !inSellerFlow && (
        <div id="browse-section" className="scroll-mt-24">
          <AiFirstBrowsePrompt />
        </div>
      )}
      <div>
        <ListingGrid hideEmptyAssistant={emptySearchMode} />
      </div>
    </>
  );

  return (
    <>
      <SearchResultsFocus />
      {/* Single content mount — desktop B2B split OR mobile column (never both) */}
      {isDesktop ? (
        <DesktopHomeLayout header={<HeroSection>{heroBlock}</HeroSection>}>
          <ContentSection>{browseSection}</ContentSection>
        </DesktopHomeLayout>
      ) : (
        <>
          <HeroSection>{heroBlock}</HeroSection>
          <ContentSection>{browseSection}</ContentSection>
        </>
      )}
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

    <VautoAdaptiveLayout>

      <ZeroUiViewTransition view={currentView} renderView={renderView} />

    </VautoAdaptiveLayout>

  );

}


