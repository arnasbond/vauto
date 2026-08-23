"use client";

import { Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { AiInterpretationChips } from "@/components/marketplace/AiInterpretationChips";
import { ListingGrid } from "@/components/ListingGrid";
import { VerticalExperienceStrip } from "@/components/chameleon/PortalExperienceStrip";
import { VerticalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { verticalExperienceForQuery } from "@/lib/vertical-presentation";

export default function DiscoverPage() {
  const { sellerStep } = useSellerFlow();
  const {
    searchQuery,
    setSearchQuery,
    marketplaceFilters,
    setMarketplaceFilters,
  } = useVautoSearch();
  const [liveDraft, setLiveDraft] = useState("");
  const verticalActive = Boolean(searchQuery.trim()) || sellerStep !== "idle";
  const isFluxHome =
    !verticalActive ||
    verticalExperienceForQuery(searchQuery).vertical === "marketplace";

  return (
    <AppShell>
      <Suspense fallback={null}>
        <HeroSection>
          <VerticalPageChrome
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
            {isFluxHome && (
              <div className="mt-5 rounded-2xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-card-bg)] p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-primary)]">
                  Atrasti
                </p>
                <h1 className="mt-1 text-xl font-extrabold text-[var(--vauto-text-heading)]">
                  Išmanioji paieška ir rekomendacijos
                </h1>
                <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
                  Ieškok tekstu arba nuotrauka. VAUTO atrenka skelbimus palyginimui.
                  Kainos patarimai yra rekomendacija, ne garantuota rinkos kaina.
                </p>
              </div>
            )}
          </VerticalPageChrome>
        </HeroSection>

        <ContentSection>
          {isFluxHome && <VerticalExperienceStrip />}
          <ListingGrid />
        </ContentSection>
      </Suspense>
    </AppShell>
  );
}
