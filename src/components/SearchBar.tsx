"use client";

import { Camera, Loader2, Mic, Sparkles } from "lucide-react";
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
import { capturePhoto, type CapturedPhoto } from "@/lib/native-media";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";
import { isVoiceSearchSupported, startVoiceSearch } from "@/lib/voice-search";
import type { ListingCategory } from "@/lib/types";

const GEMINI_BLUE = "#1167b1";

function applyFastSearchToGrid(
  query: string,
  listings: ReturnType<typeof useVauto>["listings"],
  setAgentPinnedListings: (ids: string[] | null) => void,
  setMarketplaceFilters: (
    filters: import("@/lib/marketplace-view").MarketplaceFilterState
  ) => void,
  marketplaceFilters: import("@/lib/marketplace-view").MarketplaceFilterState,
  userCity?: string
): Promise<string | false> {
  return runFastAgentSearch(query, listings, { userCity }).then((fast) => {
    if (!fast) {
      setAgentPinnedListings(null);
      return false;
    }

    if (fast.actions.type === "search") {
      setAgentPinnedListings(fast.actions.listingIds);
      if (fast.actions.filters) {
        setMarketplaceFilters(
          mergeAgentIntoMarketplaceFilters(
            marketplaceFilters,
            fast.actions.filters,
            { resetAbsentGeo: true, resetAbsentCondition: true }
          )
        );
      }
      return fast.actions.searchQuery;
    }
    if (fast.actions.type === "empty_search") {
      setAgentPinnedListings(null);
      if (fast.actions.filters) {
        setMarketplaceFilters(
          mergeAgentIntoMarketplaceFilters(
            marketplaceFilters,
            fast.actions.filters,
            { resetAbsentGeo: true, resetAbsentCondition: true }
          )
        );
      }
      return fast.actions.searchQuery;
    }
    return false;
  });
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
  const [prefillSearchPhoto, setPrefillSearchPhoto] = useState<CapturedPhoto | null>(
    null
  );
  const [recording, setRecording] = useState(false);
  const [voiceCaption, setVoiceCaption] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceSessionRef = useRef<ReturnType<typeof startVoiceSearch> | null>(null);

  useEffect(() => {
    if (!recording) setDraftQuery(searchQuery);
  }, [searchQuery, recording]);

  useEffect(() => {
    return () => voiceSessionRef.current?.cancel();
  }, []);

  const activeTheme =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(activeTheme), [activeTheme]);

  const zeroUiActive =
    agentBusy || searchLoading || isPhotoSearching || photoFlowOpen || recording;

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const commitSearch = useCallback(
    async (raw: string, opts?: { voice?: boolean }) => {
      const q = sanitizeSearchQuery(raw, "final");
      if (!q) return;

      if (startListingFromQuery(q)) {
        setDraftQuery("");
        setSearchQuery("");
        inputRef.current?.blur();
        return;
      }

      setSearchInputMode(opts?.voice ? "voice" : "text");
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

      setSearchLoading(true);
      try {
        const cleanQuery = await applyFastSearchToGrid(
          q,
          listings,
          setAgentPinnedListings,
          setMarketplaceFilters,
          marketplaceFilters,
          user.city
        );
        const committed = typeof cleanQuery === "string" ? cleanQuery : q;
        setDraftQuery(committed);
        setSearchQuery(committed);
        scrollToResults();
      } finally {
        setSearchLoading(false);
      }
    },
    [
      clearVisualSearch,
      listings,
      marketplaceFilters,
      setAgentPinnedListings,
      setMarketplaceFilters,
      setSearchInputMode,
      setSearchQuery,
      setSearchLoading,
      setViewMode,
      startListingFromQuery,
      user.city,
    ]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void commitSearch(draftQuery);
    inputRef.current?.blur();
  };

  const handleVoiceSearch = () => {
    if (recording) {
      voiceSessionRef.current?.stop();
      return;
    }
    if (!isVoiceSearchSupported()) {
      showToast("Balso paieška nepalaikoma šiame įrenginyje.", "info");
      return;
    }
    if (agentBusy || searchLoading || isPhotoSearching) return;

    requestMediaConsent(() => {
      setRecording(true);
      setVoiceCaption("");
      setSearchVoiceMode(true);
      setSearchInputMode("voice");
      clearVisualSearch({ keepInputMode: true });

      const session = startVoiceSearch({
        silenceMs: 2_800,
        stopOnFinal: true,
        onInterim: (text) => {
          const clean = sanitizeSpeechTranscript(text);
          if (clean) setVoiceCaption(clean);
        },
      });
      voiceSessionRef.current = session;
      void session.promise
        .then((text) => {
          const clean = sanitizeSpeechTranscript(text ?? "");
          if (!clean) return;
          return commitSearch(clean, { voice: true });
        })
        .finally(() => {
          setRecording(false);
          voiceSessionRef.current = null;
          setVoiceCaption("");
        });
    });
  };

  const routeToGeminiAgent = (text: string) => {
    const q = sanitizeSearchQuery(text, "final");
    if (!q) return;
    setDraftQuery(q);
    setSearchQuery(q);
    void sendAgentMessage(q);
  };

  const handlePhotoSearch = () => {
    if (isPhotoSearching || photoFlowOpen || recording) return;
    requestMediaConsent(async () => {
      const photo = await capturePhoto("prompt");
      if (!photo) return;
      setPrefillSearchPhoto(photo);
      setPhotoFlowOpen(true);
    });
  };

  const handlePhotoFlowSubmit = async (result: AiPhotoFlowResult) => {
    setIsPhotoSearching(true);
    try {
      const vision = await runPhotoVisionSearch(
        result.photos[0]!,
        result.extraContext || undefined
      );

      setPhotoFlowOpen(false);
      setPrefillSearchPhoto(null);

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
        marketplaceFilters,
        user.city
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

  const inputValue = recording && voiceCaption ? voiceCaption : draftQuery;

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
          value={inputValue}
          onChange={(e) => {
            setVoiceCaption("");
            setDraftQuery(e.target.value);
          }}
          placeholder="Paklauskite balsu arba tekstu — pvz. Volvo Panevėžyje"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#111827] caret-[#1167b1] placeholder:text-[#9ca3af] outline-none"
          disabled={agentBusy || searchLoading || isPhotoSearching || recording}
          autoComplete="off"
        />

        {isVoiceSearchSupported() && (
          <button
            type="button"
            onClick={handleVoiceSearch}
            disabled={agentBusy || searchLoading || isPhotoSearching}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#1167b1] transition hover:bg-[#eef6ff] disabled:opacity-40",
              recording && "animate-pulse bg-[#eef6ff]"
            )}
            aria-label={recording ? "Sustabdyti balso paiešką" : "Paieška balsu"}
            title={recording ? "Sustabdyti" : "Paieška balsu"}
          >
            <Mic className="h-5 w-5" fill={recording ? "currentColor" : "none"} />
          </button>
        )}

        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching || photoFlowOpen || recording}
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
        🎤 balsas · 📷 nuotrauka — paieška ir analizė. Skelbimui įkelti naudokite + apačioje.
      </p>

      <div className="mt-1.5 flex justify-center">
        <AiModeBadge compact />
      </div>

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="search"
        prefillPhoto={prefillSearchPhoto}
        busy={isPhotoSearching}
        onClose={() => {
          setPhotoFlowOpen(false);
          setPrefillSearchPhoto(null);
        }}
        onSubmit={handlePhotoFlowSubmit}
      />
    </>
  );
}
