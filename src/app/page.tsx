"use client";

import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterBubbles } from "@/components/FilterBubbles";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { MarketplaceCategoryGrid } from "@/components/MarketplaceCategoryGrid";
import { ServiceRequestCard } from "@/components/services/ServiceRequestCard";
import { PortalExperienceStrip } from "@/components/chameleon/PortalExperienceStrip";
import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { PopularTodaySection, SocialProofStrip } from "@/components/home/HomeInsights";
import { HotKeywordsGrid } from "@/components/home/HotKeywordsGrid";
import { BuddySearchAssistant } from "@/components/conversational/BuddySearchAssistant";
import { useVauto } from "@/context/VautoContext";
import { portalExperienceForQuery } from "@/lib/portal-experience";

function DefaultHero() {
  return (
    <div className="mt-5 rounded-2xl border border-[#dde5ef] bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1167b1]">
        VAUTO
      </p>
      <h1 className="font-display mt-2 text-[1.65rem] font-extrabold leading-[1.08] tracking-tight text-[#111827] sm:text-[1.875rem]">
        Ieškok. Rask. Įdėk.
      </h1>
      <p className="mt-2 text-[13px] leading-snug text-[#6b7280]">
        Skelbimai ir paslaugos visoje Lietuvoje — AI foto paieška, balso įvedimas ir rinkos
        kainų patarimai.
      </p>
    </div>
  );
}

export default function HomePage() {
  const { searchQuery, sellerStep } = useVauto();
  const inSellerFlow = sellerStep !== "idle";
  const portalActive = Boolean(searchQuery.trim()) || inSellerFlow;
  const isFluxHome = !portalActive || portalExperienceForQuery(searchQuery).theme === "flux";

  return (
    <AppShell>
      <HeroSection>
        <PortalPageChrome
          header={
            <>
              <Header />
              <div className="mt-3">
                <SearchBar />
              </div>
            </>
          }
        >
          {isFluxHome && <DefaultHero />}
        </PortalPageChrome>
      </HeroSection>

      <ContentSection>
        {isFluxHome && <PortalExperienceStrip />}
        <MarketplaceCategoryGrid />
        <ServiceRequestCard />
        <HotKeywordsGrid />
        <BuddySearchAssistant />
        <SocialProofStrip />
        <PopularTodaySection />
        <FilterBubbles />
        <ListingGrid />
      </ContentSection>
    </AppShell>
  );
}
