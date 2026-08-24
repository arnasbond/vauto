"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Handshake, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/design-system";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { HomeCategoryGrid } from "@/components/home/HomeCategoryGrid";
import { AiInterpretationChips } from "@/components/marketplace/AiInterpretationChips";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useCanonicalFacetQuery } from "@/hooks/useCanonicalFacetUrl";
import { resolveVerticalId } from "@vauto/shared/marketplace-domain";
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

const HOW_IT_WORKS = [
  {
    n: "1",
    title: "Rask / Paruošk",
    text: "Pasakote, ko ieškote, arba nufotografuojate. AI atrenka arba paruošia juodraštį.",
    icon: Search,
  },
  {
    n: "2",
    title: "Susitark",
    text: "Palyginate, deratės ir pateikiate pasiūlymą. Sandorį tvirtinate jūs.",
    icon: Handshake,
  },
  {
    n: "3",
    title: "Sandorio eiga",
    text: "Platformos saugumo mechanizmai, jų ribos ir sąlygos: lėšos laikomos iki gavimo. Būklę ir susitarimą tvirtinate jūs.",
    icon: ShieldCheck,
  },
] as const;

export function HomeAiHero({
  seedQuery,
  onSeedConsumed,
  compact = false,
}: HomeAiHeroProps) {
  const shell = useShellChrome();
  const { messages, busy, open } = useVautoAgent();
  const { setVertical } = useCanonicalFacetQuery();
  const {
    searchQuery,
    setSearchQuery,
    marketplaceFilters,
    setMarketplaceFilters,
  } = useVautoSearch();
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

  const startBuyerFunnel = useCallback(() => {
    const box = document.querySelector<HTMLElement>(
      '[aria-label="Skelbimų paieška"] [role="searchbox"], [aria-label="Skelbimų paieška"] input'
    );
    box?.focus();
    document.getElementById("listing-results")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
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
        className="pointer-events-none absolute inset-0 -mx-4 opacity-50 md:mx-0"
        aria-hidden
      >
        <div
          className="absolute -left-16 top-0 h-64 w-64 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--ds-ai, #059669) 16%, transparent), transparent 70%)",
          }}
        />
        <div
          className="absolute -right-10 top-8 h-56 w-56 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--ds-brand, #10b981) 10%, transparent), transparent 68%)",
          }}
        />
        <div
          className="absolute inset-x-0 top-24 h-32 opacity-25"
          style={{
            background:
              "linear-gradient(180deg, transparent, color-mix(in srgb, var(--ds-ai-soft, #ecfdf5) 60%, transparent))",
          }}
        />
      </div>

      <div className="relative">
        {!chatActive && (
          <div className="animate-[fadeIn_0.35s_var(--ds-ease,ease)_both]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="ai">AI Copilot</Badge>
              <span className="text-[length:var(--ds-text-caption-size)] font-medium text-[var(--ds-text-muted,var(--vauto-muted))]">
                Skelbimas · Paieška · Sandorio eiga
              </span>
            </div>

            <h1
              data-home-h1
              className="max-w-3xl font-[family-name:var(--font-outfit)] text-[clamp(1.7rem,4.2vw,3.15rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--ds-text-primary,var(--vauto-ink))]"
            >
              <span className="block text-[var(--ds-brand,var(--vauto-primary))]">
                Pasakyk, ko nori.
              </span>
              <span className="mt-1.5 block">
                VAUTO padės
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--ds-ai-gradient)" }}
                >
                  {" "}
                  padaryti visa kita.
                </span>
              </span>
              <span className="mt-2.5 block text-[clamp(1rem,2vw,1.3rem)] font-bold tracking-[-0.01em] text-[var(--ds-text-secondary)]">
                AI padeda. Žmogus sprendžia.
              </span>
            </h1>

            <p
              data-home-subtitle
              className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ds-text-secondary,var(--vauto-muted))] sm:text-[length:var(--ds-text-body-lg-size,1.125rem)]"
            >
              Išmanus pirkimas ir pardavimas: nuo NT ir technikos iki paslaugų
              bei transporto. AI paruošia paiešką ar juodraštį — jūs tvirtinate
              kainą, mokėjimą ir gavimą.
            </p>

            <div
              className="mt-4 flex max-w-3xl flex-col gap-2 sm:flex-row sm:flex-wrap"
              data-home-primary-ctas
            >
              <button
                type="button"
                data-buyer-cta
                onClick={startBuyerFunnel}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--ds-brand,#10b981)] px-5 py-2.5 text-sm font-bold text-white shadow-[var(--ds-shadow-sm)]"
              >
                Ieškoti skelbimų
              </button>
              <Link
                href="/add/"
                data-seller-cta
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-5 py-2.5 text-sm font-bold text-[var(--ds-text-primary)]"
              >
                Parduoti su AI
              </Link>
            </div>

            <ol
              className="mt-4 flex max-w-3xl flex-col divide-y divide-[var(--ds-border-subtle)] overflow-hidden rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)]/70 sm:flex-row sm:divide-x sm:divide-y-0"
              data-home-how-it-works
              aria-label="Kaip tai veikia"
            >
              {HOW_IT_WORKS.map((step) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.n}
                    className="flex flex-1 items-center gap-2.5 px-3 py-2.5"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ds-ai-soft)] text-[var(--ds-ai-strong)]">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">
                        {step.title}
                      </span>
                      <span className="mt-0.5 hidden text-[11px] leading-snug text-[var(--ds-text-muted)] sm:block sm:text-xs">
                        {step.text}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ol>

            <div className="home-ai-copilot-shell relative mt-5 w-full max-w-3xl">
              <div
                className="pointer-events-none absolute -inset-1.5 rounded-[1.75rem] opacity-40"
                style={{
                  background:
                    "radial-gradient(60% 80% at 50% 50%, color-mix(in srgb, var(--ds-ai) 22%, transparent), transparent)",
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

            <div className="mt-2.5 w-full max-w-3xl">
              <AiInterpretationChips
                searchQuery={liveDraft.trim() || searchQuery.trim()}
                filters={marketplaceFilters}
                onFiltersChange={setMarketplaceFilters}
                onQueryChange={setSearchQuery}
              />
            </div>

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
              onSelect={(query, _label, slug) => {
                handleChip(query);
                const verticalId = resolveVerticalId(slug);
                if (verticalId) setVertical(verticalId);
              }}
            />

            <p className="sr-only">Kaip tai veikia</p>
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
