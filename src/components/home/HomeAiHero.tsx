"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { HomeCategoryGrid } from "@/components/home/HomeCategoryGrid";
import { HomeTrendingStrip } from "@/components/home/HomeTrendingStrip";
import { HomeHeroAtmosphere } from "@/components/home/HomeHeroAtmosphere";
import { AiInterpretationChips } from "@/components/marketplace/AiInterpretationChips";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useCanonicalFacetQuery } from "@/hooks/useCanonicalFacetUrl";
import {
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
} from "@/lib/marketplace-view";
import { resolveVerticalId } from "@vauto/shared/marketplace-domain";
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
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -mx-4 h-[30rem] md:mx-0"
        aria-hidden
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--ds-brand, #10b981) 7%, transparent) 0%, color-mix(in srgb, var(--ds-brand, #10b981) 2.5%, transparent) 45%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 -mx-4 opacity-30 md:mx-0"
        aria-hidden
      >
        <div
          className="absolute -left-16 top-0 h-80 w-80 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--ds-brand, #10b981) 14%, transparent), transparent 70%)",
          }}
        />
        <div
          className="absolute -right-10 top-8 h-72 w-72 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--ds-brand, #10b981) 9%, transparent), transparent 68%)",
          }}
        />
        <div
          className="absolute left-1/3 top-24 h-64 w-64 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--ds-text-primary, #0f172a) 4%, transparent), transparent 70%)",
          }}
        />
      </div>
      <HomeHeroAtmosphere />

      <div className="relative">
        {!chatActive && (
          <div className="animate-[fadeIn_0.35s_var(--ds-ease,ease)_both]">
            <h1
              data-home-h1
              className="max-w-3xl font-[family-name:var(--font-outfit)] text-[clamp(1.7rem,4.2vw,3.15rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--ds-text-primary,var(--vauto-ink))]"
            >
              <span className="block">Pasakyk, ko nori.</span>
              <span className="mt-1.5 block">
                <span className="text-[var(--ds-brand,var(--vauto-primary))]">
                  VAUTO
                </span>{" "}
                padės padaryti visa kita.
              </span>
            </h1>

            <p
              data-home-subtitle
              className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[var(--ds-text-secondary,var(--vauto-muted))] sm:text-[length:var(--ds-text-body-lg-size,1.125rem)]"
            >
              Išmanus pirkimas ir pardavimas: nuo NT ir technikos iki paslaugų
              bei transporto. AI paruošia paiešką ar juodraštį — jūs tvirtinate
              kainą, mokėjimą ir gavimą. AI padeda. Žmogus sprendžia.
            </p>

            <div className="home-ai-copilot-shell relative mt-4 w-full max-w-3xl">
              <div
                className="pointer-events-none absolute -inset-1 rounded-[1.75rem] opacity-20"
                style={{
                  background:
                    "radial-gradient(60% 80% at 50% 50%, color-mix(in srgb, var(--ds-brand) 16%, transparent), transparent)",
                }}
                aria-hidden
              />
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

            <div
              className="mt-3.5 flex max-w-3xl flex-wrap gap-2"
              role="group"
              aria-label="Pavyzdžio frazės"
              data-search-examples
            >
              {EXAMPLE_CHIPS.map((chip) => (
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

            <HomeCategoryGrid
              counts={categoryCounts}
              onSelect={(query, _label, slug) => {
                const verticalId = resolveVerticalId(slug);
                if (verticalId) {
                  if (query) handleChip(query);
                  setVertical(verticalId);
                  return;
                }
                // Categories without a canonical vertical (Mada, Kita):
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

            <HomeTrendingStrip listings={newestListings} />
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
