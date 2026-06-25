"use client";

import { WantedEmptyState } from "@/components/wishlist/WantedEmptyState";

interface SearchEmptyAssistantBannerProps {
  searchQuery: string;
}

/** Viršutinis asistento blokas — matomas iškart po paieškos, be slinkimo žemyn */
export function SearchEmptyAssistantBanner({
  searchQuery,
}: SearchEmptyAssistantBannerProps) {
  return (
    <div id="search-empty-assistant" className="mt-3 scroll-mt-20">
      <WantedEmptyState searchQuery={searchQuery} />
    </div>
  );
}
