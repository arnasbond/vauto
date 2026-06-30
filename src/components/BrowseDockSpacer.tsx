"use client";

import { useAiBrowseDockVisible } from "@/hooks/useAiBrowseDockVisible";

/** In-flow spacer so listing grid clears fixed browse composer + BottomNav. */
export function BrowseDockSpacer() {
  const visible = useAiBrowseDockVisible();
  if (!visible) return null;
  return (
    <div
      className="browse-dock-spacer h-[calc(5.5rem+env(safe-area-inset-bottom))]"
      aria-hidden
    />
  );
}
