"use client";

import { Camera, Loader2, Mic, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  PHOTO_SEARCH_FALLBACK_MESSAGE,
  applyVisualPhotoSearchToGrid,
  runPhotoVisionSearch,
} from "@/lib/photo-vision-search";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { isSellIntent } from "@/lib/gemini-intent";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { cn } from "@/lib/cn";
import { runFastAgentSearch } from "@/lib/fast-agent-search";
import { buildCurrentPageContext } from "@/lib/vauto-agent-client";
import { parseVoiceUiCommand } from "@/lib/voice-ui-commands";
import { applyVoiceUiCommand } from "@/lib/voice-ui-actions";
import {
  mergeAgentIntoMarketplaceFilters,
  parseViewModeIntent,
  isViewModeOnlyCommand,
} from "@/lib/marketplace-view";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import { isVoiceSearchSupported, startVoiceSearch } from "@/lib/voice-search";
import {
  isConversationalSearchIntent,
} from "@/lib/search-conversational-intent";
import {
  BRUTAL_VOICE_GREETING,
  brutalHtml5Speak,
  shouldForceLiveVoiceAssistant,
} from "@/lib/brutal-voice-fallback";
import { isWardrobePortalQuery } from "@/lib/wardrobe-cabinet-mode";
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

export function SearchBar({
  variant = "default",
  seedQuery,
  onSeedConsumed,
}: {
  variant?: "default" | "hero";
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
}) {
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
    toggleSave,
    activateWardrobeSpinta,
  } = useVauto();

  const pathname = usePathname();
  const router = useRouter();

  const { sendAgentMessage, busy: agentBusy, setOpen: setAgentOpen } = useVautoAgent();

  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
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

      if (isWardrobePortalQuery(q)) {
        activateWardrobeSpinta();
        if (pathname !== "/fashion" && pathname !== "/fashion/") {
          router.push("/fashion/");
        }
      }

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

      if (shouldForceLiveVoiceAssistant(q, opts?.voice)) {
        setSearchInputMode("voice");
        setSearchVoiceMode(true);
        clearVisualSearch({ keepInputMode: true });
        setAgentPinnedListings(null);
        setDraftQuery(q);
        setSearchQuery("");
        setAgentOpen(true);
        brutalHtml5Speak(BRUTAL_VOICE_GREETING);
        void sendAgentMessage(q, { fromVoice: true }).then((res) => {
          if (res.ok && res.reply) {
            speakBuddyMessage(res.reply, { enabled: true, force: true });
          }
        });
        return;
      }

      if (isConversationalSearchIntent(q)) {
        setSearchInputMode(opts?.voice ? "voice" : "text");
        if (opts?.voice) setSearchVoiceMode(true);
        clearVisualSearch({ keepInputMode: true });
        setAgentPinnedListings(null);
        setDraftQuery(q);
        setSearchQuery("");
        setAgentOpen(true);
        void sendAgentMessage(q, { fromVoice: Boolean(opts?.voice) }).then((res) => {
          if (res.ok && res.reply && opts?.voice) {
            speakBuddyMessage(res.reply, { enabled: true, force: true });
          }
        });
        return;
      }

      const pageContext = buildCurrentPageContext({
        pathname: pathname ?? "/",
        listings,
        sellerId: user.id,
      });
      const voiceCmd = opts?.voice ? parseVoiceUiCommand(q) : { type: "none" as const };
      if (voiceCmd.type !== "none") {
        const handled = applyVoiceUiCommand(voiceCmd, {
          activeListingId: pageContext.active_listing_id,
          marketplaceFilters,
          setMarketplaceFilters,
          toggleSave,
          showToast,
        });
        if (handled.handled) {
          setDraftQuery(q);
          setSearchQuery(q);
          if (opts?.voice && handled.reply) {
            speakBuddyMessage(handled.reply, { enabled: true, force: true });
          }
          scrollToResults();
          return;
        }
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
      setSearchVoiceMode,
      setViewMode,
      setAgentOpen,
      sendAgentMessage,
      startListingFromQuery,
      toggleSave,
      pathname,
      showToast,
      user.city,
      user.id,
      activateWardrobeSpinta,
      router,
    ]
  );

  const lastSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedQuery?.trim() || seedQuery === lastSeedRef.current) return;
    lastSeedRef.current = seedQuery;
    setDraftQuery(seedQuery);
    void commitSearch(seedQuery).finally(() => onSeedConsumed?.());
  }, [seedQuery, commitSearch, onSeedConsumed]);

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
        silenceMs: 2_000,
        onInterim: (preview) => {
          if (preview) setVoiceCaption(preview);
        },
      });
      voiceSessionRef.current = session;
      void session.promise
        .then((text) => {
          setVoiceCaption("");
          if (!text) return;
          setDraftQuery(text);
          return commitSearch(text, { voice: true });
        })
        .finally(() => {
          setRecording(false);
          voiceSessionRef.current = null;
          setVoiceCaption("");
        });
    });
  };

  const routeToGeminiAgent = (text: string, photoUrls?: string[]) => {
    const q = sanitizeSearchQuery(text, "final");
    if (!q) return;
    setDraftQuery(q);
    setSearchQuery(q);
    void sendAgentMessage(q, {
      pendingImageUrls: photoUrls?.filter(Boolean).slice(0, 6),
    });
  };

  const handlePhotoSearch = () => {
    if (isPhotoSearching || photoFlowOpen || recording) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handlePhotoFlowSubmit = async (result: AiPhotoFlowResult) => {
    setIsPhotoSearching(true);
    try {
      const vision = await runPhotoVisionSearch(result.photos[0]!, {
        extraContext: result.extraContext || undefined,
        userCity: user.city,
        userName: user.name,
      });

      setPhotoFlowOpen(false);

      if (!vision || vision.confidence < 0.35 || !vision.keywords.trim()) {
        showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
        return;
      }

      const contextText = [result.extraContext, vision.title].filter(Boolean).join(" ");
      if (contextText && isSellIntent(contextText)) {
        setSearchInputMode("photo");
        setSearchVoiceMode(false);
        routeToGeminiAgent(
          result.extraContext?.trim() || `Noriu įkelti skelbimą: ${vision.title}`,
          result.photos
        );
        return;
      }

      const grid = applyVisualPhotoSearchToGrid(
        vision,
        listings,
        marketplaceFilters,
        user.name
      );

      setSearchInputMode("photo");
      setSearchVoiceMode(false);
      setDraftQuery(grid.searchQuery);
      setSearchQuery(grid.searchQuery);
      setMarketplaceFilters(grid.filters);
      setAgentPinnedListings(grid.listingIds.length ? grid.listingIds : null);

      void applyVisualSearch(
        buildVisualSearchProfile(
          {
            title: vision.title ?? grid.searchQuery,
            price: 0,
            location: grid.intent.cityNominative || user.city || "Lietuva",
            contact: user.phone || "+370 612 34567",
            category: (vision.category as ListingCategory) ?? "other",
            confidence: vision.confidence,
            attributes: grid.intent.searchFilters as Record<string, string>,
          },
          "photo",
          result.photos[0]
        )
      );

      showToast(grid.secretaryComment, "success");
      speakBuddyMessage(grid.secretaryComment, { enabled: true });
      scrollToResults();
    } catch {
      showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
    } finally {
      setIsPhotoSearching(false);
    }
  };

  const isHero = variant === "hero";
  const inputValue = recording && voiceCaption ? voiceCaption : draftQuery;

  return (
    <>
      <form
        className={cn(
          "flex items-center gap-2 border shadow-sm transition-colors",
          isHero
            ? "home-ai-hero-search rounded-[1.35rem] py-2.5 pl-4 pr-2"
            : "vauto-surface-panel rounded-xl py-1.5 pl-3.5 pr-1.5",
          zeroUiActive && "zero-ui-search-active"
        )}
        style={{ borderColor: isHero ? "var(--vauto-border)" : ui.searchBorder }}
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles
          className={cn(
            "shrink-0 transition-opacity",
            isHero ? "h-5 w-5" : "h-4 w-4",
            agentBusy && "zero-ui-icon-pulse"
          )}
          style={{ color: isHero ? "var(--vauto-primary)" : GEMINI_BLUE }}
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
          placeholder={
            isHero
              ? "Pvz. Ieškau BMW 530d iki 20 000 €"
              : "Paklauskite balsu arba tekstu — pvz. Volvo Panevėžyje"
          }
          enterKeyHint="search"
          className={cn(
            "min-w-0 flex-1 border-none bg-transparent outline-none",
            isHero ? "text-[15px]" : "text-sm text-[var(--vauto-text-main,#111827)] caret-[var(--vauto-primary,#1167b1)] placeholder:text-[var(--vauto-text-muted,#9ca3af)]"
          )}
          disabled={agentBusy || searchLoading || isPhotoSearching || recording}
          autoComplete="off"
        />

        {isVoiceSearchSupported() && (
          <button
            type="button"
            onClick={handleVoiceSearch}
            disabled={agentBusy || searchLoading || isPhotoSearching}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary,#1167b1)] transition hover:bg-white/10 disabled:opacity-40",
              isHero ? "h-11 w-11" : "h-10 w-10 rounded-lg hover:bg-[#eef6ff]",
              recording && "animate-pulse bg-white/10"
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
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary,#1167b1)] transition hover:bg-white/10 disabled:opacity-40",
            isHero ? "h-11 w-11" : "h-10 w-10 rounded-lg hover:bg-[#eef6ff]"
          )}
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

      {!isHero && (
        <>
          <p className="mt-2 text-center text-[11px] text-[#6b7280]">
            🎤 balsas · 📷 nuotrauka — paieška ir analizė. Skelbimui įkelti naudokite + apačioje.
          </p>

          <div className="mt-1.5 flex justify-center">
            <AiModeBadge compact />
          </div>
        </>
      )}

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
