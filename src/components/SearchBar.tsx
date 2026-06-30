"use client";

import { Camera, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  PHOTO_SEARCH_FALLBACK_MESSAGE,
  applyVisualPhotoSearchToGrid,
  runPhotoVisionSearch,
} from "@/lib/photo-vision-search";
import {
  clearPhotoSearchSession,
  persistPhotoSearchSession,
} from "@/lib/photo-search-session";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { detectSellerListingIntent } from "@/lib/scoring";
import { looksLikeClothingListing } from "@/lib/clothing-catalog";
import { pushAddListing } from "@/lib/listing-navigation";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { formatSearchAlternativeChips } from "@/lib/vision-choice-chips";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { cn } from "@/lib/cn";
import {
  parseViewModeIntent,
  isViewModeOnlyCommand,
} from "@/lib/marketplace-view";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import { subscribeHomeReset } from "@/lib/home-reset";
import type { ListingCategory } from "@/lib/types";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { buildVisionSearchAgentAction } from "@/lib/vision-agent-bridge";

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
    marketplaceFilters,
    startListingFromQuery,
  } = useVauto();

  const pathname = usePathname();
  const router = useRouter();
  const { trackEvent } = useUserBehavior();
  const { sendAgentMessage, busy: agentBusy, applyAgentActions, openWithGreeting } = useVautoAgent();

  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    return subscribeHomeReset(() => {
      setPhotoFlowOpen(false);
      setIsPhotoSearching(false);
      setDraftQuery("");
    });
  }, []);

  const activeTheme =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(activeTheme), [activeTheme]);

  const zeroUiActive = agentBusy || searchLoading || isPhotoSearching || photoFlowOpen;

  const wardrobeSearchOnly =
    pathname === "/fashion" || pathname === "/fashion/";

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
      } else if (actions.type === "apply_ui_filters") {
        const q = actions.query?.trim() || actions.filters?.query?.trim();
        if (q) setDraftQuery(stripLegacyCategorySuffixes(q));
        focusSearchOutcome(0);
      } else if (actions.type === "navigate_to_screen") {
        if (actions.query?.trim()) {
          setDraftQuery(stripLegacyCategorySuffixes(actions.query.trim()));
        }
        focusSearchOutcome(0);
      }
    },
    [applyAgentActions]
  );

  const commitSearch = useCallback(
    async (raw: string) => {
      const q = stripLegacyCategorySuffixes(sanitizeSearchQuery(raw, "final"));
      if (!q) return;

      trackEvent("search_submit", {
        query: q,
        voice: false,
        wardrobeMode: wardrobeSearchOnly,
        pathname: pathname ?? "/",
      });

      if (detectSellerListingIntent(q)) {
        const fashion = looksLikeClothingListing(q);
        setSearchInputMode("text");
        setDraftQuery(q);
        pushAddListing(router, fashion);
        if (startListingFromQuery(q)) return;
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

      setDraftQuery(q);
      setAgentPinnedListings(null);
      clearVisualSearch({ keepInputMode: true });
      setSearchLoading(true);
      void sendAgentMessage(q, { fromSearchBar: true })
        .then((res) => {
          if (res.actions) syncGridFromAgentActions(res.actions);
          else if (res.ok) scrollToResults();
        })
        .finally(() => setSearchLoading(false));
    },
    [
      clearVisualSearch,
      setAgentPinnedListings,
      setSearchInputMode,
      setSearchQuery,
      setSearchLoading,
      setViewMode,
      sendAgentMessage,
      syncGridFromAgentActions,
      pathname,
      trackEvent,
      wardrobeSearchOnly,
      startListingFromQuery,
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

  const handlePhotoSearch = () => {
    if (isPhotoSearching || photoFlowOpen) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handlePhotoFlowSubmit = async (
    result: AiPhotoFlowResult
  ): Promise<boolean> => {
    setIsPhotoSearching(true);
    await persistPhotoSearchSession(
      { dataUrl: result.photos[0]!, fileName: result.fileName },
      result.extraContext
    );
    try {
      const vision = await runPhotoVisionSearch(result.photos[0]!, {
        extraContext: result.extraContext || undefined,
        userCity: user.city,
        userName: user.name,
        wardrobeOnly: wardrobeSearchOnly,
      });

      if (!vision || (!vision.keywords.trim() && !vision.intent.semanticAlternatives?.length)) {
        showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
        return false;
      }

      if (vision.confidence < 0.35 && !vision.intent.semanticAlternatives?.length) {
        showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
        return false;
      }

      const searchChips = vision.intent.choiceChips?.filter(Boolean) ?? [];
      if (searchChips.length >= 2) {
        openWithGreeting(
          vision.intent.clarificationPrompt ||
            "Nuotraukoje matau kelis objektus. Ką norite ieškoti?",
          { quickReplies: searchChips }
        );
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }

      if (result.extraContext?.trim()) {
        setSearchInputMode("photo");
        setDraftQuery(result.extraContext.trim());
        setSearchLoading(true);
        void sendAgentMessage(result.extraContext.trim(), {
          fromSearchBar: true,
          pendingImageUrls: result.photos?.filter(Boolean).slice(0, 6),
        })
          .then((res) => {
            if (res.actions) syncGridFromAgentActions(res.actions);
          })
          .finally(() => setSearchLoading(false));
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }

      const grid = applyVisualPhotoSearchToGrid(
        vision,
        listings,
        marketplaceFilters,
        user.name,
        wardrobeSearchOnly
      );

      const itemLabel = vision.title ?? grid.searchQuery;
      setSearchInputMode("photo");

      if (grid.listingIds.length === 0) {
        const altChips = formatSearchAlternativeChips(
          vision.intent.semanticAlternatives ?? []
        );
        setDraftQuery(itemLabel);
        if (altChips.length >= 2) {
          openWithGreeting(
            `Tikslaus „${itemLabel}" neradau. Pabandykime artimiausius variantus:`,
            { quickReplies: altChips }
          );
          showToast("Pasiūliau panašius variantus — pasirinkite žemiau.", "info");
        } else {
          void sendAgentMessage(
            `Nuotraukoje matau: ${itemLabel}. Šio daikto turguje neradau — ar norite jį įdėti pardavimui?`,
            { pendingImageUrls: result.photos?.filter(Boolean).slice(0, 6) }
          );
          showToast(
            "Tokio skelbimo neradome. Galiu padėti sukurti juodraštį pardavimui.",
            "info"
          );
        }
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }

      const action = buildVisionSearchAgentAction(vision, grid.listingIds, {
        wardrobeOnly: wardrobeSearchOnly,
        label: grid.secretaryComment,
      });
      syncGridFromAgentActions(action);

      setDraftQuery(grid.searchQuery);
      setSearchQuery(grid.searchQuery);

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
      scrollToResults();
      clearPhotoSearchSession();
      setPhotoFlowOpen(false);
      return true;
    } catch {
      showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
      return false;
    } finally {
      setIsPhotoSearching(false);
    }
  };

  const isHero = variant === "hero";

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
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder={
            isHero
              ? "Pvz. Ieškau BMW 530d iki 20 000 €"
              : "Rašykite paiešką arba įkelkite nuotrauką…"
          }
          enterKeyHint="search"
          className={cn(
            "min-w-0 flex-1 border-none bg-transparent outline-none",
            isHero
              ? "text-[15px]"
              : "text-sm text-[var(--vauto-text-main,#111827)] caret-[var(--vauto-primary,#1167b1)] placeholder:text-[var(--vauto-text-muted,#9ca3af)]"
          )}
          disabled={agentBusy || searchLoading || isPhotoSearching}
          autoComplete="off"
        />

        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching || photoFlowOpen}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary,#1167b1)] transition hover:bg-white/10 disabled:opacity-40",
            isHero ? "h-11 w-11" : "h-10 w-10 rounded-lg hover:bg-[#eef6ff]"
          )}
          aria-label="Vision AI paieška pagal nuotrauką"
          title="Vision AI — nuotrauka"
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
            📷 Vision AI — nuotraukos paieška ir analizė. Tekstas — greitas Gemini chat.
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
