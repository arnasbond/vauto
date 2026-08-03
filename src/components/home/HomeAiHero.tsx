"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/Header";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { isEmbeddedAgentChatVisible } from "@/lib/agent-chat-layout";

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
  const { messages, busy, open } = useVautoAgent();
  const chatActive = open || isEmbeddedAgentChatVisible(messages, busy);
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
        {chatActive && (
          <div className="w-full min-w-0">
            <AgentChatStrip
              seedQuery={activeSeed}
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
    <div className="relative mb-2 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -mx-4 opacity-60 md:mx-0"
        style={{
          background:
            "radial-gradient(900px 420px at 50% -10%, var(--vauto-primary-soft), transparent 60%)",
        }}
        aria-hidden
      />

      <div className="relative">
        <div className="md:hidden">
          <Header />
        </div>

        {!chatActive && (
          <>
            <h1 className="vauto-layout-heading font-[family-name:var(--font-outfit)] text-[2rem] font-extrabold leading-[1.1] tracking-tight text-[var(--vauto-ink)] sm:text-4xl md:text-[2.85rem] md:leading-tight">
              <span className="block text-[var(--vauto-primary)]">VAUTO</span>
              <span className="mt-1 block text-[1.35rem] font-bold sm:text-2xl md:text-[1.85rem]">
                Parduok ir rask greičiau Lietuvoje
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--vauto-muted)] sm:text-lg">
              Nuotrauka, kaina ir Omniva — viename pokalbyje. Be triukšmo, be
              bereikalingų žingsnių.
            </p>

            <div className="mt-6 w-full md:max-w-none">
              <AiCommandBar
                placement="hero"
                seedQuery={activeSeed}
                onSeedConsumed={handleSeedConsumed}
                className="md:max-w-4xl"
              />
            </div>
          </>
        )}

        {chatActive && (
          <div className="w-full min-w-0">
            <AgentChatStrip
              seedQuery={activeSeed}
              onSeedConsumed={handleSeedConsumed}
            />
          </div>
        )}
      </div>
    </div>
  );
}
