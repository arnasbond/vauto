"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { VautoLogo } from "@/components/VautoLogo";
import { SearchBar } from "@/components/SearchBar";
import { HomeQuickActions } from "@/components/home/HomeQuickActions";
import { Header } from "@/components/Header";

interface HomeAiHeroProps {
  showQuickActions?: boolean;
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  onSearchPrompt?: (prompt: string) => void;
  compact?: boolean;
}

export function HomeAiHero({
  showQuickActions = true,
  seedQuery,
  onSeedConsumed,
  onSearchPrompt,
  compact = false,
}: HomeAiHeroProps) {
  const focusSearch = () => {
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
    }, 80);
  };

  if (compact) {
    return (
      <div className="mb-2">
        <Header />
        <div className="mt-3">
          <SearchBar
            variant="hero"
            seedQuery={seedQuery}
            onSeedConsumed={onSeedConsumed}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <Header />

      <div className="mt-8 flex flex-col items-center text-center">
        <Link href="/" className="mb-6 inline-block" aria-label="VAUTO pradžia">
          <VautoLogo
            className="text-[2.35rem] sm:text-[2.75rem]"
            color="var(--vauto-text-main)"
            dotColor="var(--vauto-accent)"
          />
        </Link>

        <div className="mb-4 flex items-center gap-2 px-2">
          <Sparkles
            className="h-4 w-4 shrink-0 text-[var(--vauto-primary)]"
            aria-hidden
          />
          <p className="home-ai-hero-greeting font-display text-[15px] font-medium leading-snug sm:text-base">
            Sveiki, aš esu VAUTO asistentas. Ko ieškote šiandien?
          </p>
        </div>
      </div>

      <div className="mt-2">
        <SearchBar
          variant="hero"
          seedQuery={seedQuery}
          onSeedConsumed={onSeedConsumed}
        />
      </div>

      {showQuickActions && (
        <HomeQuickActions
          onSearchFocus={focusSearch}
          onSearchPrompt={onSearchPrompt}
        />
      )}
    </div>
  );
}
