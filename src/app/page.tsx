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
import { PopularTodaySection, SocialProofStrip } from "@/components/home/HomeInsights";
import { HotKeywordsGrid } from "@/components/home/HotKeywordsGrid";
import { BuddySearchAssistant } from "@/components/conversational/BuddySearchAssistant";

export default function HomePage() {
  return (
    <AppShell>
      <HeroSection>
        <div className="sticky top-0 z-40 -mx-4 border-b border-[#dde5ef] bg-[#f3f5f8]/95 px-4 pb-3 pt-2 backdrop-blur-xl">
          <Header />
          <div className="mt-3">
            <SearchBar />
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-[#dde5ef] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1167b1]">
            VAUTO
          </p>
          <h1 className="font-display mt-2 text-[1.65rem] font-extrabold leading-[1.08] tracking-tight text-[#111827] sm:text-[1.875rem]">
            Ieškok. Rask. Įdėk.
          </h1>
          <p className="mt-2 text-[13px] leading-snug text-[#6b7280]">
            Skelbimai ir paslaugos visoje Lietuvoje — AI foto paieška, balso
            įvedimas ir rinkos kainų patarimai.
          </p>
        </div>
      </HeroSection>

      <ContentSection>
        <PortalExperienceStrip />
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
