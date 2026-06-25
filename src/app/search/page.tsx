"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { SearchResultsFocus } from "@/components/search/SearchResultsFocus";
import { useVauto } from "@/context/VautoContext";

export default function SearchPage() {
  const { searchQuery } = useVauto();

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
          header={
            <>
              <Header />
              <div className="mt-3">
                <SearchBar />
              </div>
            </>
          }
        >
          <div className="mt-4 rounded-2xl border border-[#dde5ef] bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1167b1]">
              Paieška
            </p>
            <h1 className="mt-1 text-xl font-extrabold text-[#111827]">
              Raskite tai, ko ieškote
            </h1>
            <p className="mt-2 text-sm text-[#6b7280]">
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
