"use client";

import { useCallback, useEffect, useState } from "react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { HomeAiHero } from "@/components/home/HomeAiHero";
import { ZeroUiListingPreview } from "@/components/zero-ui/ZeroUiListingPreview";
import { ZeroUiBusinessDashboard } from "@/components/zero-ui/ZeroUiBusinessDashboard";
import { ZeroUiAdminPanel } from "@/components/zero-ui/ZeroUiAdminPanel";
import { ZeroUiViewTransition } from "@/components/zero-ui/ZeroUiViewTransition";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import type { ZeroUiScreen } from "@/lib/zero-ui-screens";
import { SearchEmptyAssistantBanner } from "@/components/search/SearchEmptyAssistantBanner";
import { SearchResultsFocus } from "@/components/search/SearchResultsFocus";
import { subscribeHomeReset } from "@/lib/home-reset";
import { HowItWorksSection, type HowItWorksStep } from "@/components/ui";
import { HomeAiValueBand } from "@/components/home/HomeValuePropCards";

const HOME_HOW_STEPS: HowItWorksStep[] = [
  {
    n: "1",
    title: "Parašykite arba įkelkite foto",
    text: "Vision AI + pokalbio asistentas — be formų: nuotrauka ar sakinys užtenka.",
  },
  {
    n: "2",
    title: "AI paruošia skelbimą ir kainą",
    text: "Antraštė, aprašymas ir AI kainos vertintojas (rinkos rėžis) — tu tik patvirtini.",
  },
  {
    n: "3",
    title: "Skelbkite ir siųskite per Omniva",
    text: "Publikuokite iškart; pirkėjui — užsakymas su paštomatu vienu paspaudimu.",
  },
];

function MarketplaceView() {
  const { rankedListings } = useVauto();
  const { searchQuery, searchLoading } = useVautoSearch();
  const { messages, busy: agentBusy, open: agentOpen } = useVautoAgent();

  const [seedQuery, setSeedQuery] = useState<string | null>(null);

  const hasSearch = searchQuery.trim().length >= 3;
  const hasAgentTurn =
    agentOpen ||
    agentBusy ||
    messages.some((m) => m.role === "user" || m.role === "assistant");
  const compactHero = hasSearch || hasAgentTurn;
  const showHowItWorks = !compactHero;

  const emptySearchMode = hasSearch && rankedListings.length === 0 && !searchLoading;

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
              <HomeAiHero
                compact={compactHero}
                seedQuery={seedQuery}
                onSeedConsumed={() => setSeedQuery(null)}
              />
              {emptySearchMode && (
                <SearchEmptyAssistantBanner searchQuery={searchQuery.trim()} />
              )}
            </>
          }
        >
          <span className="sr-only">VAUTO pagrindinis puslapis</span>
        </PortalPageChrome>
      </HeroSection>
      {showHowItWorks ? (
        <>
          <HowItWorksSection
            steps={HOME_HOW_STEPS}
            className="border-b border-[var(--vauto-border-subtle)] py-10 sm:py-12"
          />
          <HomeAiValueBand />
        </>
      ) : null}
      <ContentSection>
        <ListingGrid hideEmptyAssistant={emptySearchMode} />
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
    <VautoAdaptiveLayout>
      <ZeroUiViewTransition view={currentView} renderView={renderView} />
    </VautoAdaptiveLayout>
  );
}
