"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/Header";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { HomeCategoriesBar } from "@/components/home/HomeCategoriesBar";
import { HomeSearchEducationPills } from "@/components/home/HomeSearchEducationPills";
import { HomeValuePropCards } from "@/components/home/HomeValuePropCards";
import { useShellChrome } from "@/hooks/useShellChrome";

interface HomeAiHeroProps {
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  compact?: boolean;
}

export function HomeAiHero({
  seedQuery,
  onSeedConsumed,
  compact = false,
}: HomeAiHeroProps) {
  const shell = useShellChrome();
  const [pillSeed, setPillSeed] = useState<string | null>(null);
  const activeSeed = pillSeed ?? seedQuery ?? null;

  const handleSeedConsumed = useCallback(() => {
    setPillSeed(null);
    onSeedConsumed?.();
  }, [onSeedConsumed]);

  const handlePillSelect = useCallback((query: string) => {
    setPillSeed(query);
  }, []);

  if (compact) {
    return (
      <div className="mb-2">
        <div className="md:hidden">
          <Header />
        </div>
        <div className="mt-3 md:mt-0">
          <AiCommandBar
            placement="top"
            seedQuery={activeSeed}
            onSeedConsumed={handleSeedConsumed}
          />
        </div>
        <AgentChatStrip />
      </div>
    );
  }

  if (!shell.showHomeHero) {
    return null;
  }

  return (
    <div className="mb-2">
      <div className="md:hidden">
        <Header />
      </div>

      <div className="flex flex-col items-center text-center md:items-start md:text-left">
        <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-orange-600">
          ✨ DIRBTINIO INTELEKTO SKELBIMAI
        </span>

        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-[2.75rem] md:leading-tight">
          Nauja karta skelbimų. Valdoma DI.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          VAUTO – pirmasis Lietuvos skelbimų puslapis su dirbtiniu intelektu.
          Rašykite laisvai, kaip kalbate – DI supras ir atras geriausius
          pasiūlymus.
        </p>

        <HomeValuePropCards className="mt-8 w-full" />
      </div>

      <div className="mt-8 w-full md:max-w-3xl">
        <AiCommandBar
          placement="hero"
          seedQuery={activeSeed}
          onSeedConsumed={handleSeedConsumed}
        />
        <HomeSearchEducationPills onSelect={handlePillSelect} />
      </div>

      <HomeCategoriesBar className="mt-6" />
      <AgentChatStrip />
    </div>
  );
}
