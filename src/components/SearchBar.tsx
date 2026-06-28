"use client";

import { Camera, Loader2, Mic, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  PHOTO_SEARCH_FALLBACK_MESSAGE,
  applyVisualPhotoSearchToGrid,
  runPhotoVisionSearch,
} from "@/lib/photo-vision-search";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { cn } from "@/lib/cn";
import { buildCurrentPageContext } from "@/lib/vauto-agent-client";
import { parseVoiceUiCommand } from "@/lib/voice-ui-commands";
import { applyVoiceUiCommand } from "@/lib/voice-ui-actions";
import {
  parseViewModeIntent,
  isViewModeOnlyCommand,
} from "@/lib/marketplace-view";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import {
  isVoiceSearchSupported,
  recycleSpeechRecognitionEngine,
  startVoiceSearch,
} from "@/lib/voice-search";
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import {
  BRUTAL_VOICE_GREETING,
  brutalHtml5Speak,
  shouldForceLiveVoiceAssistant,
} from "@/lib/brutal-voice-fallback";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import type { ListingCategory } from "@/lib/types";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";

const GEMINI_BLUE = "#1167b1";

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
  } = useVauto();

  const pathname = usePathname();

  const { sendAgentMessage, busy: agentBusy, applyAgentActions } = useVautoAgent();

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

  const wardrobeSearchOnly =
    pathname === "/fashion" ||
    pathname === "/fashion/";

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const syncGridFromAgentActions = useCallback(
    (actions: VautoAgentAction | undefined) => {
      if (!actions || actions.type === "none") return;
      applyAgentActions(actions);
      if (actions.type === "search") {
        setDraftQuery(stripLegacyCategorySuffixes(actions.searchQuery));
        focusSearchOutcome(actions.listingIds.length);
      } else if (actions.type === "empty_search") {
        setDraftQuery(stripLegacyCategorySuffixes(actions.searchQuery));
        focusSearchOutcome(0);
      }
    },
    [applyAgentActions]
  );

  const commitSearch = useCallback(
    async (raw: string, opts?: { voice?: boolean }) => {
      const q = stripLegacyCategorySuffixes(sanitizeSearchQuery(raw, "final"));
      if (!q) return;

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

      // Mazgas 1→2→3: Gemini → applyActions → tinklelis
      const routeThroughAgent = (voice: boolean) => {
        setSearchInputMode(voice ? "voice" : "text");
        if (voice) setSearchVoiceMode(true);
        setDraftQuery(q);
        setAgentPinnedListings(null);
        clearVisualSearch({ keepInputMode: true });
        setSearchLoading(true);
        void sendAgentMessage(q, { fromVoice: voice, fromSearchBar: true })
          .then((res) => {
            if (res.actions) {
              syncGridFromAgentActions(res.actions);
            } else if (res.ok) {
              scrollToResults();
            }
            if (res.ok && res.reply && voice) {
              speakBuddyMessage(res.reply, { enabled: true, force: true });
            }
          })
          .finally(() => setSearchLoading(false));
      };

      if (shouldForceLiveVoiceAssistant(q, opts?.voice)) {
        clearVisualSearch({ keepInputMode: true });
        setAgentPinnedListings(null);
        brutalHtml5Speak(BRUTAL_VOICE_GREETING);
        routeThroughAgent(true);
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

      routeThroughAgent(Boolean(opts?.voice));
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
      sendAgentMessage,
      syncGridFromAgentActions,
      toggleSave,
      pathname,
      showToast,
      user.id,
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
      void recycleSpeechRecognitionEngine().then(() => {
        setRecording(true);
        setVoiceCaption("");
        setDraftQuery("");
        setSearchQuery("");
        setSearchVoiceMode(true);
        setSearchInputMode("voice");
        clearVisualSearch({ keepInputMode: true });

        const session = startVoiceSearch({
          silenceMs: 2_000,
          onStart: () => {
            setDraftQuery("");
            setVoiceCaption("");
          },
          onInterim: (preview) => {
            setVoiceCaption(preview.trim());
          },
        });
        voiceSessionRef.current = session;
        void session.promise
          .then((text) => {
            setVoiceCaption("");
            if (!text) return;
            const clean = stripLegacyCategorySuffixes(text);
            setDraftQuery(clean);
            return commitSearch(clean, { voice: true });
          })
          .finally(() => {
            setRecording(false);
            voiceSessionRef.current = null;
            setVoiceCaption("");
            void recycleSpeechRecognitionEngine();
          });
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
        wardrobeOnly: wardrobeSearchOnly,
      });

      setPhotoFlowOpen(false);

      if (!vision || vision.confidence < 0.35 || !vision.keywords.trim()) {
        showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
        return;
      }

      if (result.extraContext?.trim()) {
        setSearchInputMode("photo");
        setSearchVoiceMode(false);
        routeToGeminiAgent(result.extraContext.trim(), result.photos);
        return;
      }

      const grid = applyVisualPhotoSearchToGrid(
        vision,
        listings,
        marketplaceFilters,
        user.name,
        wardrobeSearchOnly
      );

      const itemLabel = vision.title ?? grid.searchQuery;

      if (grid.listingIds.length === 0) {
        setSearchInputMode("photo");
        setSearchVoiceMode(false);
        setDraftQuery(itemLabel);
        setAgentPinnedListings(null);
        void sendAgentMessage(
          `Nuotraukoje matau: ${itemLabel}. Šio daikto turguje neradau — ar norite jį įdėti pardavimui?`,
          { pendingImageUrls: result.photos?.filter(Boolean).slice(0, 6) }
        );
        showToast(
          "Tokio skelbimo neradome. Galiu padėti sukurti juodraštį pardavimui.",
          "info"
        );
        speakBuddyMessage(
          "Šio daikto turguje neradau. Ar norite jį įdėti pardavimui?",
          { enabled: true }
        );
        return;
      }

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
  const inputValue = recording ? voiceCaption : draftQuery;

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
