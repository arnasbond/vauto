"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { VautoLogo } from "@/components/VautoLogo";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { Header } from "@/components/Header";
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

  if (compact) {
    return (
      <div className="mb-2">
        <Header />
        <div className="mt-3">
          <AiCommandBar
            placement="top"
            seedQuery={seedQuery}
            onSeedConsumed={onSeedConsumed}
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
      <Header />

      <div className="mt-8 flex flex-col items-center text-center">
        <Link href="/" className="mb-6 inline-block" aria-label="VAUTO pradžia">
          <VautoLogo
            className="text-[2.35rem] sm:text-[2.75rem]"
            color="var(--vauto-text-main)"
            dotColor="var(--vauto-accent)"
          />
        </Link>

        <div className="mb-2 flex items-center gap-2 px-2">
          <Sparkles
            className="h-4 w-4 shrink-0 text-[var(--vauto-primary)]"
            aria-hidden
          />
          <p className="home-ai-hero-greeting vauto-body-text text-[15px] font-medium sm:text-base">
            Sveiki, aš esu VAUTO asistentas. Ko ieškote ar ką parduodate šiandien?
          </p>
        </div>
        <p className="mb-4 px-2 text-center text-xs text-[var(--vauto-text-muted)]">
          Automobiliai · nekilnojamasis turtas · paslaugos · mada · įvairūs skelbimai
        </p>
      </div>

      <div className="mt-2">
        <AiCommandBar
          placement="hero"
          seedQuery={seedQuery}
          onSeedConsumed={onSeedConsumed}
        />
      </div>
    </div>
  );
}
