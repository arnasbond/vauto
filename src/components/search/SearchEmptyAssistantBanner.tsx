"use client";

import { WantedEmptyState } from "@/components/wishlist/WantedEmptyState";
import { useVauto } from "@/context/VautoContext";
import { buildEmptySearchBannerMessage } from "@/lib/empathy-copy";
import { isAbsurdSearchQuery } from "@/lib/search-query-match";
import { resolveBrowseAllIntent } from "@/lib/browse-all-intent";

interface SearchEmptyAssistantBannerProps {
  searchQuery: string;
}

/** Viršutinis asistento blokas — matomas iškart po paieškos, be slinkimo žemyn */
export function SearchEmptyAssistantBanner({
  searchQuery,
}: SearchEmptyAssistantBannerProps) {
  const { listings } = useVauto();
  const absurd = isAbsurdSearchQuery(searchQuery, listings);

  if (resolveBrowseAllIntent(searchQuery)) {
    return null;
  }

  if (!absurd) {
    return (
      <div
        id="search-empty-assistant"
        className="mt-3 scroll-mt-20 rounded-2xl border border-dashed border-[#d1d5db] bg-white p-4 text-center text-sm text-[#6b7280]"
      >
        {buildEmptySearchBannerMessage(searchQuery)}
      </div>
    );
  }

  return (
    <div id="search-empty-assistant" className="mt-3 scroll-mt-20">
      <WantedEmptyState searchQuery={searchQuery} />
    </div>
  );
}
