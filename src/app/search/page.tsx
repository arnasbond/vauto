"use client";

import { Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { AiInterpretationChips } from "@/components/marketplace/AiInterpretationChips";
import { ListingGrid } from "@/components/ListingGrid";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { VerticalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { SearchResultsFocus } from "@/components/search/SearchResultsFocus";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useVauto } from "@/context/VautoContext";
import { resolveActiveSurface, catalogSurfaceVisible } from "@/lib/ai-surface-ownership";

export default function SearchPage() {
  const {
    searchQuery,
    setSearchQuery,
    marketplaceFilters,
    setMarketplaceFilters,
  } = useVautoSearch();
  const { aiDraft, sellerStep } = useVauto();
  const [liveDraft, setLiveDraft] = useState("");

  // Same global SELL surface ownership as / and /discover: while SELL/CREATE
  // owns the interaction, the catalog/search scaffold must not render.
  const showCatalog = catalogSurfaceVisible(
    resolveActiveSurface({
      sellerStep,
      hasListingDraft: Boolean(aiDraft),
      searchQuery,
    })
  );

  return (
    <AppShell>
      <Suspense fallback={null}>
        <SearchResultsFocus />
        <HeroSection>
          <VerticalPageChrome
            minimal
            header={
              <>
                <TopAiCommandChrome
                  sticky={false}
                  onDraftChange={setLiveDraft}
                  className="mb-0 border-none bg-transparent px-0 pb-0 pt-0 backdrop-blur-none"
                />
                {searchQuery.trim() || liveDraft.trim() ? (
                  <div className="mt-3 max-w-3xl">
                    <AiInterpretationChips
                      searchQuery={liveDraft.trim() || searchQuery.trim()}
                      filters={marketplaceFilters}
                      onFiltersChange={setMarketplaceFilters}
                      onQueryChange={setSearchQuery}
                    />
                  </div>
                ) : null}
              </>
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
          </VerticalPageChrome>
        </HeroSection>

        {showCatalog && (
          <ContentSection>
            <ListingGrid />
          </ContentSection>
        )}
      </Suspense>
    </AppShell>
  );
}
