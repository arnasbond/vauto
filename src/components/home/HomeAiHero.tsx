"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { HomeCategoryGrid } from "@/components/home/HomeCategoryGrid";
import { HomeTrendingStrip } from "@/components/home/HomeTrendingStrip";
import { HomeHeroAtmosphere } from "@/components/home/HomeHeroAtmosphere";
import { AiInterpretationChips } from "@/components/marketplace/AiInterpretationChips";
import { SEARCH_CONTEXT_RESET_EVENT } from "@/lib/start-ai-seller-listing";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useCanonicalFacetQuery } from "@/hooks/useCanonicalFacetUrl";
import {
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
} from "@/lib/marketplace-view";
import { resolveVerticalId, type VerticalId } from "@vauto/shared/marketplace-domain";
import { VISIBLE_CATEGORY_BY_SLUG, type VisibleCategoryId } from "@vauto/shared/category-registry";
import { isEmbeddedAgentChatVisible } from "@/lib/agent-chat-layout";
import { cn } from "@/lib/cn";

interface HomeAiHeroProps {
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  compact?: boolean;
}

const EXAMPLE_CHIPS = [
  "2 kambarių butas Vilniaus centre iki 120 000 €",
  "Ekskavatoriaus nuoma Kaune savaitgaliui",
  "MacBook Pro M3 Max naudotas, puikios būklės",
  "Ekonomiškas dyzelinis universalas iki 7 000 €",
] as const;

/**
 * F7 contract — home category cards navigate to the /search results view for
 * categories WITHOUT a dedicated presentation vertical. CLOTHING and OTHER
 * became canonical SELL-FLOW verticals (F12 8-vertical parity), but their
 * home navigation must keep the canonical-category-filter /search path
 * (`resolveVerticalId` now resolves them, so the presentation branch must
 * stay excluded explicitly).
 */
const HOME_NAV_EXCLUDED_VERTICALS: ReadonlySet<VerticalId> = new Set([
  "CLOTHING",
  "OTHER",
]);

export function HomeAiHero({
  seedQuery,
  onSeedConsumed,
  compact = false,
}: HomeAiHeroProps) {
  const shell = useShellChrome();
  const router = useRouter();
  const { messages, busy, open } = useVautoAgent();
  const { setVertical } = useCanonicalFacetQuery();
  const { listings } = useVauto();
  const {
    searchQuery,
    setSearchQuery,
    marketplaceFilters,
    setMarketplaceFilters,
  } = useVautoSearch();
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<VisibleCategoryId, number>> = {};
    for (const listing of listings) {
      const visible = VISIBLE_CATEGORY_BY_SLUG[
        listing.category as keyof typeof VISIBLE_CATEGORY_BY_SLUG
      ];
      if (!visible) continue;
      counts[visible] = (counts[visible] ?? 0) + 1;
    }
    return counts;
  }, [listings]);
  const newestListings = useMemo(
    () =>
      listings
        .filter((l) => !l.status || l.status === "active")
        .slice()
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [listings]
  );
  const chatActive = open || isEmbeddedAgentChatVisible(messages, busy);
  const [draftSeed, setDraftSeed] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<string>("");

  // F9 — a fresh sell session clears any previous search intent left in the
  // hero draft („Rodyk visus" / stale query) so the interpretation block
  // cannot bleed into the sell flow.
  useEffect(() => {
    const onReset = () => setLiveDraft("");
    window.addEventListener(SEARCH_CONTEXT_RESET_EVENT, onReset);
    return () => window.removeEventListener(SEARCH_CONTEXT_RESET_EVENT, onReset);
  }, []);

  const handleSeedConsumed = useCallback(() => {
    onSeedConsumed?.();
  }, [onSeedConsumed]);

  const handleDraftSeedConsumed = useCallback(() => {
    setDraftSeed(null);
  }, []);

  const handleChip = useCallback((text: string) => {
    setActiveChip(text);
    setDraftSeed(text);
  }, []);

  if (compact) {
    return (
      <div className="mb-2">
        {!chatActive && (
          <div className="mt-1 w-full md:mt-0 md:max-w-4xl">
            <AiCommandBar
              placement="top"
              seedQuery={seedQuery}
              onSeedConsumed={handleSeedConsumed}
            />
          </div>
        )}
        {chatActive && (
          <div className="w-full min-w-0">
            <AgentChatStrip
              seedQuery={seedQuery}
              onSeedConsumed={handleSeedConsumed}
            />
          </div>
        )}
      </div>
    );
  }

  if (!compact && !shell.showHomeHero && !chatActive) {
    return null;
  }

  return (
    <div className="relative mb-4 overflow-hidden md:mb-6">
      <div className="relative">
        {!chatActive && (
          <div>
            <div className="home-v5-photo relative isolate overflow-hidden rounded-2xl px-4 pb-6 pt-6 md:px-8 md:pb-8 md:pt-10">
            <HomeHeroAtmosphere />
            <div className="relative">
            <h1
              data-home-h1
              className="max-w-3xl font-[family-name:var(--font-outfit)] text-[clamp(1.75rem,3.2vw,2.75rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--ds-text-primary,var(--vauto-ink))]"
            >
              <span className="block">Pasakyk arba parodyk, ko nori.</span>
              <span className="mt-3 block text-base font-medium leading-snug md:text-xl">
                <span className="text-[var(--ds-brand,var(--vauto-primary))]">
                  VAUTO
                </span>{" "}
                padės padaryti visa kita.
              </span>
            </h1>

            <p
              data-home-subtitle
              className="mt-2.5 max-w-2xl text-[length:var(--ds-text-body-lg-size,1.125rem)] font-medium text-[var(--ds-text-secondary,var(--vauto-muted))]"
            >
              Ieškok, pirk arba parduok.
            </p>

            <div className="home-ai-copilot-shell relative mt-4 w-full max-w-3xl">
              <AiCommandBar
                placement="hero"
                seedQuery={seedQuery}
                onSeedConsumed={handleSeedConsumed}
                draftSeed={draftSeed}
                onDraftSeedConsumed={handleDraftSeedConsumed}
                onDraftChange={setLiveDraft}
                className="relative z-[1]"
              />
            </div>

            {(liveDraft.trim() || searchQuery.trim()) && (
              <div className="mt-2.5 w-full max-w-3xl rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-3">
                <AiInterpretationChips
                  searchQuery={liveDraft.trim() || searchQuery.trim()}
                  filters={marketplaceFilters}
                  onFiltersChange={setMarketplaceFilters}
                  onQueryChange={setSearchQuery}
                />
              </div>
            )}

            </div>
            </div>
            <details className="mt-2 text-xs text-[var(--ds-text-muted)]">
              <summary className="cursor-pointer py-2">Paieškos pavyzdžiai</summary>
            <div
              className="mt-1 flex max-w-3xl flex-wrap gap-2"
              role="group"
              aria-label="Pavyzdžio frazės"
              data-search-examples
            >
              {EXAMPLE_CHIPS.slice(0, 2).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChip(chip)}
                  className={cn(
                    "max-w-full rounded-full border border-[var(--ds-border-subtle,#e6e9f0)] bg-[var(--ds-surface-card,#fff)] px-3 py-1.5",
                    "text-left text-[12px] font-medium leading-snug text-[var(--ds-text-secondary)] shadow-[var(--ds-shadow-xs)]",
                    "transition-[transform,box-shadow,border-color,background-color] duration-[160ms] ease-[var(--ds-ease)]",
                    "hover:-translate-y-px hover:border-[var(--ds-ai)]/40 hover:bg-[var(--ds-ai-soft)] hover:shadow-[var(--ds-shadow-sm)]",
                    "focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring-ai)]",
                    activeChip === chip &&
                      "border-[var(--ds-ai)]/50 bg-[var(--ds-ai-soft)] text-[var(--ds-ai-strong)]"
                  )}
                >
                  <span className="line-clamp-2 break-words">{chip}</span>
                </button>
              ))}
            </div>

            </details>
            <HomeTrendingStrip listings={newestListings} onSeeAll={() => router.push("/search")} className="mt-3 pt-3" />

            <HomeCategoryGrid
              className="mt-6"
              counts={categoryCounts}
              onSelect={(query, _label, slug) => {
                const verticalId = resolveVerticalId(slug);
                if (verticalId && !HOME_NAV_EXCLUDED_VERTICALS.has(verticalId)) {
                  if (query) handleChip(query);
                  setVertical(verticalId);
                  return;
                }
                // Categories without a home-presentation vertical (Mada, Kita):
                // apply the SAME canonical category filter the filter bar
                // uses and navigate to the search results view — the button
                // is never a no-op, even with an empty query.
                setMarketplaceFilters(
                  normalizeMarketplaceFilters({
                    ...marketplaceFilters,
                    category: slug as MarketplaceFilterState["category"],
                  })
                );
                setSearchQuery("");
                router.push("/search");
              }}
            />
          </div>
        )}

        {chatActive && (
          <div className="w-full min-w-0">
            <AgentChatStrip
              seedQuery={seedQuery}
              onSeedConsumed={handleSeedConsumed}
            />
          </div>
        )}
      </div>
    </div>
  );
}
