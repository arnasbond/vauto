"use client";

import { Header } from "@/components/Header";
import { AiCommandBar } from "@/components/search/AiCommandBar";
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
  return (
    <div
      className={cn(
        "top-ai-command-chrome mb-3",
        sticky &&
          "sticky top-0 z-30 -mx-4 border-b border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-bg)_92%,transparent)] px-4 pb-3 pt-2 backdrop-blur-xl",
        variant === "wardrobe" && "chameleon-wardrobe",
        className
      )}
    >
      <Header />
      <div className="mt-3">
        <AiCommandBar
          placement="top"
          seedQuery={seedQuery}
          onSeedConsumed={onSeedConsumed}
        />
      </div>
    </div>
  );
}
