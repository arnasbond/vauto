"use client";

import { Header } from "@/components/Header";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { useLayoutMode } from "@/context/LayoutModeContext";
import { cn } from "@/lib/cn";

interface TopAiCommandChromeProps {
  variant?: "default" | "wardrobe";
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  sticky?: boolean;
  className?: string;
}

/**
 * P10 — unified sticky top AI search chrome (home compact, wardrobe, discover, search).
 */
export function TopAiCommandChrome({
  variant = "default",
  seedQuery,
  onSeedConsumed,
  sticky = true,
  className,
}: TopAiCommandChromeProps) {
  const { isDesktop } = useLayoutMode();

  return (
    <div
      className={cn(
        "top-ai-command-chrome mb-3",
        sticky &&
          !isDesktop &&
          "sticky top-0 z-30 -mx-4 border-b border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-bg)_92%,transparent)] px-4 pb-3 pt-2 backdrop-blur-xl",
        isDesktop && "mb-5",
        variant === "wardrobe" && "chameleon-wardrobe",
        className
      )}
    >
      {!isDesktop && <Header />}
      {isDesktop && variant === "wardrobe" && (
        <div className="mb-4">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--anonser-text)]">
            Mano skelbimai
          </h1>
          <p className="mt-1 text-sm text-[var(--anonser-text-muted)]">
            Valdykite skelbimus, statistiką ir redagavimą pokalbiu su DI.
          </p>
        </div>
      )}
      <div className={cn(isDesktop ? "max-w-3xl" : "mt-3")}>
        <AiCommandBar
          placement="top"
          seedQuery={seedQuery}
          onSeedConsumed={onSeedConsumed}
        />
      </div>
    </div>
  );
}
