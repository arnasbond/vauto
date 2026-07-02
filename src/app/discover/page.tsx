"use client";

import { AppShell } from "@/components/AppShell";
import { TopAiCommandChrome } from "@/components/layout/TopAiCommandChrome";
import { ListingGrid } from "@/components/ListingGrid";
import { AiFirstBrowsePrompt } from "@/components/search/AiFirstBrowsePrompt";
import { PortalExperienceStrip } from "@/components/chameleon/PortalExperienceStrip";
import { PortalPageChrome } from "@/components/chameleon/PortalPageChrome";
import { HeroSection, ContentSection } from "@/components/HeroSection";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { portalExperienceForQuery } from "@/lib/portal-experience";

export default function DiscoverPage() {
  const { sellerStep } = useSellerFlow();
  const { searchQuery } = useVautoSearch();
  const portalActive = Boolean(searchQuery.trim()) || sellerStep !== "idle";
  const isFluxHome = !portalActive || portalExperienceForQuery(searchQuery).theme === "flux";

  return (
    <AppShell>
      <HeroSection>
        <PortalPageChrome
          header={<TopAiCommandChrome sticky={false} className="mb-0 border-none bg-transparent px-0 pb-0 pt-0 backdrop-blur-none" />}
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
                Ieškok tekstu arba nuotrauka. VAUTO surikiuoja skelbimus ir
                siūlo rinkos kainų patarimus visoje Lietuvoje.
              </p>
            </div>
          )}
        </PortalPageChrome>
      </HeroSection>

      <ContentSection>
        {isFluxHome && <PortalExperienceStrip />}
        {isFluxHome && <AiFirstBrowsePrompt />}
        <ListingGrid />
      </ContentSection>
    </AppShell>
  );
}
