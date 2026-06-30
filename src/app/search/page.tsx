"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { SearchResultsFocus } from "@/components/search/SearchResultsFocus";
import { useVautoSearch } from "@/context/VautoSearchContext";

export default function SearchPage() {
  const { searchQuery } = useVautoSearch();

  useEffect(() => {
    if (searchQuery.trim()) {
      document
        .getElementById("listing-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchQuery]);

  return (
    <AppShell>
      <SearchResultsFocus />
      <HeroSection>
        <PortalPageChrome
          minimal
          header={
            <TopAiCommandChrome
              sticky={false}
              className="mb-0 border-none bg-transparent px-0 pb-0 pt-0 backdrop-blur-none"
            />
          }
        >
          <div className="search-hero-card mt-4 rounded-2xl p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-primary)]">
              Paieška
            </p>
            <h1 className="search-hero-title mt-1 text-xl font-extrabold">
              Raskite tai, ko ieškote
            </h1>
            <p className="search-hero-subtitle mt-2 text-sm">
              Rašykite paiešką, filtruokite ir perjunkite tinklelį, sąrašą ar žemėlapį.
            </p>
          </div>
        </PortalPageChrome>
      </HeroSection>

      <ContentSection>
        <ListingGrid />
      </ContentSection>
    </AppShell>
  );
}
