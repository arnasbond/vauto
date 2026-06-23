"use client";

import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterBubbles } from "@/components/FilterBubbles";
import { ListingGrid } from "@/components/ListingGrid";
import { MarketplaceCategoryGrid } from "@/components/MarketplaceCategoryGrid";
import { ServiceRequestCard } from "@/components/services/ServiceRequestCard";
import { PortalExperienceStrip } from "@/components/chameleon/PortalExperienceStrip";
import { HotKeywordsGrid } from "@/components/home/HotKeywordsGrid";

export default function DiscoverPage() {
  return (
    <AppShell>
      <section className="safe-top px-4 pt-2">
        <div className="sticky top-0 z-40 -mx-4 border-b border-[#dde5ef] bg-[#f3f5f8]/95 px-4 pb-3 pt-2 backdrop-blur-xl">
          <Header />
          <div className="mt-3">
            <SearchBar />
          </div>
        </div>

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
      </section>

      <section className="px-4 pt-4">
        <PortalExperienceStrip />
        <MarketplaceCategoryGrid />
        <ServiceRequestCard />
        <HotKeywordsGrid />
        <FilterBubbles />
        <ListingGrid />
      </section>
    </AppShell>
  );
}
