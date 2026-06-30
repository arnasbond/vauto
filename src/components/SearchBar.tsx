"use client";

import { AiCommandBar } from "@/components/search/AiCommandBar";

/** @deprecated Use AiCommandBar — kept for gradual migration. */
export function SearchBar({
  variant = "default",
  seedQuery,
  onSeedConsumed,
}: {
  variant?: "default" | "hero";
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
}) {
  return (
    <AiCommandBar
      placement={variant === "hero" ? "hero" : "inline"}
      seedQuery={seedQuery}
      onSeedConsumed={onSeedConsumed}
    />
  );
}
