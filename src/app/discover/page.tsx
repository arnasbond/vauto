"use client";

import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterBubbles } from "@/components/FilterBubbles";
import { ListingGrid } from "@/components/ListingGrid";
import { MarketplaceCategoryGrid } from "@/components/MarketplaceCategoryGrid";
import { ServiceRequestCard } from "@/components/services/ServiceRequestCard";
import { PortalExperienceStrip } from "@/components/chameleon/PortalExperienceStrip";
import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { HotKeywordsGrid } from "@/components/home/HotKeywordsGrid";
import { useVauto } from "@/context/VautoContext";
import { portalExperienceForQuery } from "@/lib/portal-experience";

export default function DiscoverPage() {
  const { searchQuery, sellerStep } = useVauto();
  const portalActive = Boolean(searchQuery.trim()) || sellerStep !== "idle";
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
          {isFluxHome && (
            <div className="mt-5 rounded-2xl border border-[#dde5ef] bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1167b1]">
                Atrasti
              </p>
              <h1 className="mt-1 text-xl font-extrabold text-[#111827]">
                Išmanioji paieška ir rekomendacijos
              </h1>
              <p className="mt-2 text-sm text-[#6b7280]">
                Ieškok tekstu, balsu arba nuotrauka. VAUTO surikiuoja skelbimus ir
                siūlo rinkos kainų patarimus visoje Lietuvoje.
              </p>
            </div>
          )}
        </PortalPageChrome>
      </HeroSection>

      <ContentSection>
        {isFluxHome && <PortalExperienceStrip />}
        <MarketplaceCategoryGrid />
        <ServiceRequestCard />
        <HotKeywordsGrid />
        <FilterBubbles />
        <ListingGrid />
      </ContentSection>
    </AppShell>
  );
}
