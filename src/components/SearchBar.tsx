"use client";

import { Camera, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { buildPhotoSearchToast } from "@/lib/photo-search";
import {
  PHOTO_SEARCH_FALLBACK_MESSAGE,
  runPhotoVisionSearch,
} from "@/lib/photo-vision-search";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { isSellIntent } from "@/lib/gemini-intent";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { cn } from "@/lib/cn";
import { runFastAgentSearch } from "@/lib/fast-agent-search";
import {
  mergeAgentIntoMarketplaceFilters,
  parseViewModeIntent,
  isViewModeOnlyCommand,
} from "@/lib/marketplace-view";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import type { ListingCategory } from "@/lib/types";

const GEMINI_BLUE = "#1167b1";

function applyFastSearchToGrid(
  query: string,
  listings: ReturnType<typeof useVauto>["listings"],
  setAgentPinnedListings: (ids: string[] | null) => void,
  setMarketplaceFilters: (
    filters: import("@/lib/marketplace-view").MarketplaceFilterState
  ) => void,
  marketplaceFilters: import("@/lib/marketplace-view").MarketplaceFilterState
): string | false {
  const fast = runFastAgentSearch(query, listings);
  if (!fast) {
    setAgentPinnedListings(null);
    return false;
  }

  if (fast.actions.type === "search") {
    setAgentPinnedListings(fast.actions.listingIds);
    if (fast.actions.filters) {
      setMarketplaceFilters(
        mergeAgentIntoMarketplaceFilters(marketplaceFilters, fast.actions.filters)
      );
    }
    return fast.actions.searchQuery;
  }
  if (fast.actions.type === "empty_search") {
    setAgentPinnedListings([]);
    if (fast.actions.filters) {
      setMarketplaceFilters(
        mergeAgentIntoMarketplaceFilters(marketplaceFilters, fast.actions.filters)
      );
    }
    return fast.actions.searchQuery;
  }
  return false;
}

export function SearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    requestMediaConsent,
    startListingFromQuery,
    setSearchVoiceMode,
    setSearchInputMode,
    applyVisualSearch,
    clearVisualSearch,
    showToast,
    user,
    sellerStep,
    chameleonTheme,
    setSearchLoading,
    searchLoading,
    listings,
    setAgentPinnedListings,
    setViewMode,
    setMarketplaceFilters,
    marketplaceFilters,
  } = useVauto();

  const { sendAgentMessage, busy: agentBusy } = useVautoAgent();

  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  const activeTheme =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(activeTheme), [activeTheme]);

  const zeroUiActive = agentBusy || searchLoading || isPhotoSearching || photoFlowOpen;

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const commitSearch = useCallback(
    (raw: string) => {
      const q = sanitizeSearchQuery(raw, "final");
      if (!q) return;

      if (startListingFromQuery(q)) {
        setDraftQuery("");
        setSearchQuery("");
        inputRef.current?.blur();
        return;
      }

      setSearchInputMode("text");
      clearVisualSearch({ keepInputMode: true });

      const viewIntent = parseViewModeIntent(q);
      if (viewIntent) setViewMode(viewIntent);

      if (isViewModeOnlyCommand(q)) {
        setDraftQuery(q);
        setSearchQuery(q);
        setAgentPinnedListings(null);
        scrollToResults();
        return;
      }

      const cleanQuery = applyFastSearchToGrid(
        q,
        listings,
        setAgentPinnedListings,
        setMarketplaceFilters,
        marketplaceFilters
      );
      const committed = typeof cleanQuery === "string" ? cleanQuery : q;
      setDraftQuery(committed);
      setSearchQuery(committed);
      scrollToResults();
    },
    [
      clearVisualSearch,
      listings,
      marketplaceFilters,
      setAgentPinnedListings,
      setMarketplaceFilters,
      setSearchInputMode,
      setSearchQuery,
      setViewMode,
      startListingFromQuery,
    ]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitSearch(draftQuery);
    inputRef.current?.blur();
  };

  const handleGeminiSend = () => {
    const q = sanitizeSearchQuery(draftQuery, "final");
    if (!q || agentBusy || searchLoading) return;

    setSearchInputMode("text");
    setDraftQuery(q);
    setSearchQuery(q);
    setSearchLoading(true);
    void sendAgentMessage(q).finally(() => setSearchLoading(false));
  };

  const routeToGeminiAgent = (text: string) => {
    const q = sanitizeSearchQuery(text, "final");
    if (!q) return;
    setDraftQuery(q);
    setSearchQuery(q);
    void sendAgentMessage(q);
  };

  const handlePhotoSearch = () => {
    if (isPhotoSearching || photoFlowOpen) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handlePhotoFlowSubmit = async (result: AiPhotoFlowResult) => {
    setIsPhotoSearching(true);
    try {
      const vision = await runPhotoVisionSearch(
        result.photos[0]!,
        result.extraContext || undefined
      );

      setPhotoFlowOpen(false);

      if (!vision || vision.confidence < 0.4 || !vision.keywords.trim()) {
        showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
        return;
      }

      const contextText = [result.extraContext, vision.title].filter(Boolean).join(" ");
      if (contextText && isSellIntent(contextText)) {
        setSearchInputMode("photo");
        setSearchVoiceMode(false);
        routeToGeminiAgent(
          result.extraContext?.trim() || `Noriu įkelti skelbimą: ${vision.title}`
        );
        return;
      }

      const query = vision.keywords;
      setSearchInputMode("photo");
      setSearchVoiceMode(false);
      setDraftQuery(query);
      setSearchQuery(query);

      applyFastSearchToGrid(
        query,
        listings,
        setAgentPinnedListings,
        setMarketplaceFilters,
        marketplaceFilters
      );

      void applyVisualSearch(
        buildVisualSearchProfile(
          {
            title: vision.title ?? query,
            price: 0,
            location: user.city || "Lietuva",
            contact: user.phone || "+370 612 34567",
            category: (vision.category as ListingCategory) ?? "other",
            confidence: vision.confidence,
          },
          "photo",
          result.photos[0]
        )
      );

      showToast(
        buildPhotoSearchToast({
          title: vision.title ?? query,
          price: 0,
          location: user.city || "Lietuva",
          contact: user.phone || "+370 612 34567",
          category: (vision.category as ListingCategory) ?? "other",
          confidence: vision.confidence,
        }),
        "success"
      );
      scrollToResults();
    } catch {
      showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
    } finally {
      setIsPhotoSearching(false);
    }
  };

  return (
    <>
      <form
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-white py-1.5 pl-3.5 pr-1.5 shadow-sm transition-colors",
          zeroUiActive && "zero-ui-search-active"
        )}
        style={{ borderColor: ui.searchBorder }}
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles
          className={cn(
            "h-4 w-4 shrink-0 transition-opacity",
            agentBusy && "zero-ui-icon-pulse"
          )}
          style={{ color: GEMINI_BLUE }}
          aria-hidden
        />

        <input
          ref={inputRef}
          type="search"
          name="q"
          role="searchbox"
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder="Paklauskite Gemini — pvz. iPhone 13 arba Volvo Kaune"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#111827] caret-[#1167b1] placeholder:text-[#9ca3af] outline-none"
          disabled={agentBusy || searchLoading || isPhotoSearching}
          autoComplete="off"
        />

        <button
          type="button"
          onClick={handleGeminiSend}
          disabled={agentBusy || searchLoading || isPhotoSearching || !draftQuery.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#1167b1] transition hover:bg-[#eef6ff] disabled:opacity-40"
          aria-label="Siųsti Gemini asistentui"
          title="Siųsti Gemini"
        >
          {agentBusy || searchLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </button>

        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching || photoFlowOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#1167b1] transition hover:bg-[#eef6ff] disabled:opacity-40"
          aria-label="Ieškoti ar analizuoti pagal nuotrauką"
          title="Nuotrauka — Vision AI"
        >
          {isPhotoSearching ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>
      </form>

      <p className="mt-2 text-center text-[11px] text-[#6b7280]">
        ✨ Gemini · 📷 nuotrauka — paieška ir analizė. Skelbimui įkelti naudokite + apačioje.
      </p>

      <div className="mt-1.5 flex justify-center">
        <AiModeBadge compact />
      </div>

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="search"
        busy={isPhotoSearching}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoFlowSubmit}
      />
    </>
  );
}
