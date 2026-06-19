"use client";

import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterBubbles } from "@/components/FilterBubbles";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { PopularTodaySection, SocialProofStrip } from "@/components/home/HomeInsights";

export default function HomePage() {
  return (
    <AppShell>
      <HeroSection>
        <Header />
        <h1 className="font-display mt-6 text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[1.875rem]">
          Ieškok.
          <br />
          Rask. Įdėk.
        </h1>
        <p className="mt-2 text-[13px] leading-snug text-[var(--vauto-text-muted)]">
          Paslaugos ir skelbimai Panevėžyje — AI padeda rasti ir publikuoti per
          sekundes.
        </p>
        <div className="mt-4">
          <SearchBar />
        </div>
      </HeroSection>

      <ContentSection>
        <SocialProofStrip />
        <PopularTodaySection />
        <FilterBubbles />
        <ListingGrid />
      </ContentSection>
    </AppShell>
  );
}
