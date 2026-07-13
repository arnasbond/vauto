"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/Header";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { isHomeAgentChatActive } from "@/lib/agent-chat-layout";

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
  const { messages, busy } = useVautoAgent();
  const chatActive = isHomeAgentChatActive(messages, busy);
  const [pillSeed, setPillSeed] = useState<string | null>(null);
  const activeSeed = pillSeed ?? seedQuery ?? null;

  const handleSeedConsumed = useCallback(() => {
    setPillSeed(null);
    onSeedConsumed?.();
  }, [onSeedConsumed]);

  if (compact) {
    return (
      <div className="mb-2">
        <div className="md:hidden">
          <Header />
        </div>
        {!chatActive && (
          <div className="mt-3 w-full md:mt-0 md:max-w-4xl">
            <AiCommandBar
              placement="top"
              seedQuery={activeSeed}
              onSeedConsumed={handleSeedConsumed}
            />
          </div>
        )}
        <div className="w-full min-w-0">
          <AgentChatStrip
            seedQuery={chatActive ? activeSeed : null}
            onSeedConsumed={chatActive ? handleSeedConsumed : undefined}
          />
        </div>
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
          Rašykite laisvai arba įkelkite nuotrauką — DI supras, klasifikuos ir
          paruoš profesionalų skelbimą be formų ir kategorijų.
        </p>
      </div>

      {!chatActive && (
        <div className="mt-8 w-full md:max-w-none">
          <AiCommandBar
            placement="hero"
            seedQuery={activeSeed}
            onSeedConsumed={handleSeedConsumed}
            className="md:max-w-4xl"
          />
        </div>
      )}

      <div className="w-full min-w-0">
        <AgentChatStrip
          seedQuery={chatActive ? activeSeed : null}
          onSeedConsumed={chatActive ? handleSeedConsumed : undefined}
        />
      </div>
    </div>
  );
}
