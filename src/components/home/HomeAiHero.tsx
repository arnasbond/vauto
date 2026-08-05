"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/design-system";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { AgentChatStrip } from "@/components/home/AgentChatStrip";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { isEmbeddedAgentChatVisible } from "@/lib/agent-chat-layout";
import { cn } from "@/lib/cn";

interface HomeAiHeroProps {
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  compact?: boolean;
}

const EXAMPLE_CHIPS = [
  "Parduodu 2018 m. Citroën C4, 120 tūkst. km…",
  "iPhone 15 Pro, 256GB, kaip naujas…",
  "Dviejų kambarių butas Kaune, su balkonu…",
] as const;

export function HomeAiHero({
  seedQuery,
  onSeedConsumed,
  compact = false,
}: HomeAiHeroProps) {
  const shell = useShellChrome();
  const { messages, busy, open } = useVautoAgent();
  const chatActive = open || isEmbeddedAgentChatVisible(messages, busy);
  const [draftSeed, setDraftSeed] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);

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
        className="pointer-events-none absolute inset-0 -mx-4 opacity-90 md:mx-0"
        aria-hidden
      >
        <div
          className="absolute -left-16 top-0 h-72 w-72 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--ds-ai, #6366f1) 28%, transparent), transparent 70%)",
          }}
        />
        <div
          className="absolute -right-10 top-8 h-64 w-64 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--ds-brand, #1b4dff) 18%, transparent), transparent 68%)",
          }}
        />
        <div
          className="absolute inset-x-0 top-24 h-40 opacity-40"
          style={{
            background:
              "linear-gradient(180deg, transparent, color-mix(in srgb, var(--ds-ai-soft, #eef2ff) 80%, transparent))",
          }}
        />
      </div>

      <div className="relative">
        {!chatActive && (
          <div className="animate-[fadeIn_0.35s_var(--ds-ease,ease)_both]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="ai">AI Copilot</Badge>
              <span className="text-[length:var(--ds-text-caption-size)] font-medium text-[var(--ds-text-muted,var(--vauto-muted))]">
                Pardavimas · Paieška · Omniva
              </span>
            </div>

            <h1 className="max-w-3xl font-[family-name:var(--font-outfit)] text-[clamp(1.85rem,4.5vw,3.15rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--ds-text-primary,var(--vauto-ink))]">
              <span className="block text-[var(--ds-brand,var(--vauto-primary))]">
                VAUTO
              </span>
              <span className="mt-1.5 block">
                Parduok greičiau.{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--ds-ai-gradient)" }}
                >
                  AI padarys likusį darbą
                </span>
              </span>
            </h1>

            <p className="mt-3 max-w-2xl text-[length:var(--ds-text-body-lg-size,1.125rem)] leading-relaxed text-[var(--ds-text-secondary,var(--vauto-muted))]">
              Nuotrauka ar sakinys — AI sudėlioja skelbimą, pasiūlo kainą ir
              paruošia Omniva pristatymą. Be formų triukšmo.
            </p>

            <div className="home-ai-copilot-shell relative mt-6 w-full max-w-3xl">
              <div
                className="pointer-events-none absolute -inset-3 rounded-[2rem] opacity-70 blur-xl transition-opacity duration-[var(--ds-duration-normal,180ms)]"
                style={{
                  background:
                    "radial-gradient(60% 80% at 50% 50%, color-mix(in srgb, var(--ds-ai) 35%, transparent), transparent)",
                }}
                aria-hidden
              />
              <AiCommandBar
                placement="hero"
                seedQuery={seedQuery}
                onSeedConsumed={handleSeedConsumed}
                draftSeed={draftSeed}
                onDraftSeedConsumed={handleDraftSeedConsumed}
                className="relative z-[1]"
              />
            </div>

            <div
              className="mt-3.5 flex max-w-3xl flex-wrap gap-2"
              role="group"
              aria-label="Pavyzdžio frazės"
            >
              {EXAMPLE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChip(chip)}
                  className={cn(
                    "rounded-full border border-[var(--ds-border-subtle,#e6e9f0)] bg-[var(--ds-surface-card,#fff)] px-3 py-1.5",
                    "text-left text-[12px] font-medium text-[var(--ds-text-secondary)] shadow-[var(--ds-shadow-xs)]",
                    "transition-[transform,box-shadow,border-color,background-color] duration-[160ms] ease-[var(--ds-ease)]",
                    "hover:-translate-y-px hover:border-[var(--ds-ai)]/40 hover:bg-[var(--ds-ai-soft)] hover:shadow-[var(--ds-shadow-sm)]",
                    "focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring-ai)]",
                    activeChip === chip &&
                      "border-[var(--ds-ai)]/50 bg-[var(--ds-ai-soft)] text-[var(--ds-ai-strong)]"
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
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
