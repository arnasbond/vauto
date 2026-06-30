"use client";

import { AiCommandBar } from "@/components/search/AiCommandBar";

/** @deprecated Use AiCommandBar — kept for gradual migration. */
export function SearchBar({
  variant = "default",
  seedQuery,
  onSeedConsumed,
}: {
  variant?: "default" | "hero" | "top";
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
}) {
  const placement =
    variant === "hero" ? "hero" : variant === "top" ? "top" : "inline";
  return (
    <AiCommandBar
      placement={placement}
      seedQuery={seedQuery}
      onSeedConsumed={onSeedConsumed}
    />
  );
}
