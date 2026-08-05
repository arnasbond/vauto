"use client";

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
 * Global AppHeader owns logo / profile; this chrome only hosts the AI command bar.
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
          "ds-glass sticky top-[3.5rem] z-30 -mx-4 border-b border-[var(--vauto-border)] px-4 pb-3 pt-2 md:top-16",
        isDesktop && "mb-5",
        variant === "wardrobe" && "chameleon-wardrobe",
        className
      )}
    >
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
      <div className={cn(isDesktop ? "max-w-3xl" : "mt-1")}>
        <AiCommandBar
          placement="top"
          seedQuery={seedQuery}
          onSeedConsumed={onSeedConsumed}
        />
      </div>
    </div>
  );
}
